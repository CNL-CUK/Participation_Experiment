// 운영 설정
const SCHEDULE = {
  startDate: '2026-08-31',
  endDate: '2026-09-18',
  openTime: '09:00',
  lastStartTime: '18:00',
  slotMinutes: 60,
  weekdaysOnly: true
};

const POLICY = {
  cancelDeadlineHours: 3,
  studentIdLength: 9
};

const SLOT_CAPACITY = 3;
const TEST_SLOT = '2026-08-31_09:00';

// 내부 설정
const SLOT_SHEET_NAME = 'slots';
const RESERVATION_SHEET_NAME = 'reservations';
const TZ = 'Asia/Seoul';
const LOCK_WAIT_MS = 10000;
const SLOT_CACHE_KEY = 'slot-payload-v3';
const SLOT_CACHE_SECONDS = 15;

const SLOT_HEADERS = [
  'slot_id',
  'date',
  'time',
  'operation_status',
  'capacity',
  'booked_count',
  'remaining',
  'booking_status',
  'note'
];

const COMPACT_SLOT_HEADERS = [
  'slot_id',
  'date',
  'time',
  'status',
  'capacity',
  'note'
];

const RESERVATION_HEADERS = [
  'reservation_id',
  'slot_id',
  'date',
  'time',
  'status',
  'name',
  'student_id',
  'phone',
  'course',
  'course_prof',
  'created_at',
  'cancelled_at'
];

const LEGACY_RESERVATION_HEADERS = [
  'reservation_id',
  'slot_id',
  'status',
  'name',
  'student_id',
  'phone',
  'course',
  'course_prof',
  'created_at',
  'cancelled_at'
];

const INPUT_LIMIT = {
  name: 50,
  course: 100,
  courseProf: 50
};

const UNSAFE_PREFIX = /^[=+\-@]/;

function doGet() {
  try {
    const cached = readSlotCache();
    if (cached) return json(cached);

    const payload = buildSlotPayload();
    writeSlotCache(payload);
    return json(payload);
  } catch (error) {
    console.error(error);
    return json({ ok: false, reason: 'server_error' });
  }
}

function doPost(event) {
  let request;

  try {
    if (!event || !event.postData || !event.postData.contents) {
      return json({ ok: false, reason: 'invalid_input' });
    }
    request = JSON.parse(event.postData.contents);
  } catch (error) {
    return json({ ok: false, reason: 'invalid_input' });
  }

  try {
    if (request.action === 'lookup') return lookup(request);
    if (request.action === 'book') {
      return withRequestLock(function () {
        return book(request);
      });
    }
    if (request.action === 'cancel') {
      return withRequestLock(function () {
        return cancel(request);
      });
    }
    return json({ ok: false, reason: 'unknown_action' });
  } catch (error) {
    console.error(error);
    return json({ ok: false, reason: 'server_error' });
  }
}

function withRequestLock(callback) {
  const lock = LockService.getScriptLock();
  const startedAt = Date.now();

  if (!lock.tryLock(LOCK_WAIT_MS)) {
    console.warn('reservation_lock_timeout waitedMs=' + (Date.now() - startedAt));
    return json({ ok: false, reason: 'busy' });
  }

  const acquiredAt = Date.now();

  try {
    return callback();
  } finally {
    lock.releaseLock();
    console.log(
      'reservation_lock waitedMs=' + (acquiredAt - startedAt) +
      ' heldMs=' + (Date.now() - acquiredAt)
    );
  }
}

function book(request) {
  const input = participantInput(request);
  if (!input.ok) return json({ ok: false, reason: input.reason });

  if (!isValidSlotId(request.slotId)) {
    return json({ ok: false, reason: 'invalid_input' });
  }

  const database = ensureCapacityDatabaseInternal();
  const slot = findSlot(database.slots, request.slotId);

  if (!slot) return json({ ok: false, reason: 'not_found' });

  if (!isStoredSlotOpen(slot.status)) {
    return json({ ok: false, reason: 'already_booked' });
  }

  if (isPast(slot.date, slot.time)) {
    return json({ ok: false, reason: 'expired' });
  }

  const reservations = database.reservations;
  const active = reservations.filter(function (reservation) {
    return reservation.slotId === slot.slotId &&
      reservation.status === 'booked';
  });

  const duplicate = active.some(function (reservation) {
    return reservation.studentId === input.studentId;
  });

  if (duplicate) {
    return json({ ok: false, reason: 'already_booked' });
  }

  const capacity = capacityOf(slot);

  if (active.length >= capacity) {
    return json({ ok: false, reason: 'already_booked' });
  }

  const reservation = {
    reservationId: Utilities.getUuid(),
    slotId: slot.slotId,
    date: slot.date,
    time: slot.time,
    status: 'booked',
    name: input.name,
    studentId: input.studentId,
    phone: input.phone,
    course: input.course,
    courseProf: input.courseProf,
    createdAt: nowText(),
    cancelledAt: ''
  };

  appendReservation(database.reservationSheet, reservation);
  updateSlotSummary(database.slots, slot, active.length + 1);
  commitDataChange();

  return json({
    ok: true,
    reservationId: reservation.reservationId,
    slotId: slot.slotId,
    date: slot.date,
    time: slot.time,
    capacity: capacity,
    bookedCount: active.length + 1,
    remaining: Math.max(0, capacity - active.length - 1)
  });
}

function cancel(request) {
  const identity = identityInput(request);
  if (!identity.ok) return json({ ok: false, reason: identity.reason });

  if (!isValidSlotId(request.slotId)) {
    return json({ ok: false, reason: 'invalid_input' });
  }

  const database = ensureCapacityDatabaseInternal();
  const slot = findSlot(database.slots, request.slotId);

  if (!slot) return json({ ok: false, reason: 'not_found' });

  const reservations = database.reservations;

  const identityMatches = reservations.filter(function (reservation) {
    return reservation.slotId === slot.slotId &&
      reservation.name === identity.name &&
      reservation.studentId === identity.studentId;
  });

  const activeMatch = identityMatches.find(function (reservation) {
    return reservation.status === 'booked';
  });

  if (!activeMatch) {
    if (identityMatches.length) {
      return json({ ok: false, reason: 'not_booked' });
    }

    const hasActiveReservation = reservations.some(function (reservation) {
      return reservation.slotId === slot.slotId &&
        reservation.status === 'booked';
    });

    return json({
      ok: false,
      reason: hasActiveReservation ? 'no_match' : 'not_booked'
    });
  }

  if (!canCancel(activeMatch.date, activeMatch.time)) {
    return json({ ok: false, reason: 'too_late' });
  }

  activeMatch.status = 'cancelled';
  activeMatch.cancelledAt = nowText();

  database.reservationSheet
    .getRange(activeMatch.rowIndex, 1, 1, RESERVATION_HEADERS.length)
    .setValues([reservationValues(activeMatch)]);

  const bookedCount = reservations.filter(function (reservation) {
    return reservation.slotId === slot.slotId &&
      reservation.status === 'booked' &&
      reservation.rowIndex !== activeMatch.rowIndex;
  }).length;

  const capacity = capacityOf(slot);

  updateSlotSummary(database.slots, slot, bookedCount);
  commitDataChange();

  return json({
    ok: true,
    slotId: slot.slotId,
    capacity: capacity,
    bookedCount: bookedCount,
    remaining: Math.max(0, capacity - bookedCount)
  });
}

function lookup(request) {
  const identity = identityInput(request);
  if (!identity.ok) return json({ ok: false, reason: identity.reason });

  const slots = readSlots();
  const reservations = reservationRecordsForRead(slots);
  const matches = [];

  reservations.forEach(function (reservation) {
    if (reservation.status !== 'booked') return;
    if (reservation.name !== identity.name) return;
    if (reservation.studentId !== identity.studentId) return;

    matches.push({
      slotId: reservation.slotId,
      date: reservation.date,
      time: reservation.time,
      cancelable: canCancel(reservation.date, reservation.time),
      past: isPast(reservation.date, reservation.time)
    });
  });

  matches.sort(compareSlots);

  return json({
    ok: true,
    reservations: matches
  });
}

function buildSlotPayload() {
  const slots = readSlots();
  const reservations = reservationRecordsForRead(slots);
  const bookedBySlot = bookedCounts(reservations);

  const publicSlots = slots.records.map(function (slot) {
    const capacity = capacityOf(slot);
    const bookedCount = bookedBySlot[slot.slotId] || 0;
    const remaining = Math.max(0, capacity - bookedCount);
    const status = bookingStatusOf(slot, bookedCount);

    return {
      slotId: slot.slotId,
      date: slot.date,
      time: slot.time,
      status: status,
      capacity: capacity,
      bookedCount: bookedCount,
      remaining: status === 'available' ? remaining : 0
    };
  });

  publicSlots.sort(compareSlots);

  const times = Array.from(
    new Set(
      publicSlots.map(function (slot) {
        return slot.time;
      })
    )
  ).sort();

  return {
    ok: true,
    capacity: SLOT_CAPACITY,
    times: times,
    slotMinutes: SCHEDULE.slotMinutes,
    slots: publicSlots
  };
}

function participantInput(request) {
  const identity = identityInput(request);
  if (!identity.ok) return identity;

  const phone = normalizeText(request.phone);
  const course = normalizeText(request.course);
  const courseProf = normalizeText(request.courseProf);

  if (!/^01[016789]-\d{4}-\d{4}$/.test(phone)) {
    return { ok: false, reason: 'invalid_phone' };
  }

  if (!isValidText(course, INPUT_LIMIT.course, false)) {
    return { ok: false, reason: 'invalid_text' };
  }

  if (!isValidText(courseProf, INPUT_LIMIT.courseProf, false)) {
    return { ok: false, reason: 'invalid_text' };
  }

  return {
    ok: true,
    name: identity.name,
    studentId: identity.studentId,
    phone: phone,
    course: course,
    courseProf: courseProf
  };
}

function identityInput(request) {
  const name = normalizeText(request.name);
  const studentId = normalizeText(request.studentId);

  if (!isValidText(name, INPUT_LIMIT.name, true)) {
    return { ok: false, reason: 'invalid_text' };
  }

  const studentIdPattern = new RegExp(
    '^\\d{' + POLICY.studentIdLength + '}$'
  );

  if (!studentIdPattern.test(studentId)) {
    return { ok: false, reason: 'invalid_student_id' };
  }

  return {
    ok: true,
    name: name,
    studentId: studentId
  };
}

function isValidText(value, maxLength, required) {
  if (!value) return !required;
  return value.length <= maxLength && !UNSAFE_PREFIX.test(value);
}

function isValidSlotId(value) {
  return /^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}$/.test(
    normalizeText(value)
  );
}

function readSlots() {
  const sheet = getSlotSheet();
  const values = sheet.getDataRange().getValues();

  if (!values.length || !values[0].length) {
    throw new Error('slots header is missing');
  }

  const headerKeys = values[0].map(headerKey);

  const summary = startsWithKeys(
    headerKeys,
    SLOT_HEADERS.map(headerKey)
  );

  const compact = !summary && startsWithKeys(
    headerKeys,
    COMPACT_SLOT_HEADERS.map(headerKey)
  );

  const legacy = !summary &&
    !compact &&
    values[0].length >= 10;

  if (!summary && !compact && !legacy) {
    throw new Error('Unsupported slots schema');
  }

  const records = [];
  const seen = new Set();

  for (let index = 1; index < values.length; index++) {
    const row = values[index];
    const slotId = normalizeText(row[0]);

    if (!slotId) continue;

    if (seen.has(slotId)) {
      throw new Error('Duplicate slot_id: ' + slotId);
    }

    seen.add(slotId);

    const record = {
      rowIndex: index + 1,
      slotId: slotId,
      date: formatDateValue(row[1]),
      time: formatTimeValue(row[2]),
      status: normalizeText(row[3]).toLowerCase(),
      capacity: summary || compact ? row[4] : SLOT_CAPACITY,
      bookedCount: summary ? Number(row[5]) : null,
      remaining: summary ? Number(row[6]) : null,
      bookingStatus: summary
        ? normalizeText(row[7]).toLowerCase()
        : '',
      note: summary
        ? normalizeText(row[8])
        : compact
          ? normalizeText(row[5])
          : '',
      legacy: legacy,
      legacyParticipant: null
    };

    if (legacy) {
      record.legacyParticipant = {
        name: normalizeText(row[4]),
        studentId: normalizeText(row[5]),
        phone: normalizeText(row[6]),
        course: normalizeText(row[7]),
        courseProf: normalizeText(row[8]),
        createdAt: formatDateTimeValue(row[9])
      };
    }

    records.push(record);
  }

  return {
    sheet: sheet,
    schema: summary
      ? 'summary'
      : compact
        ? 'compact'
        : 'legacy',
    columnCount: values[0].length,
    records: records
  };
}

function readReservations(sheet, slots) {
  if (!sheet || sheet.getLastRow() === 0) return [];

  const values = sheet.getDataRange().getValues();
  const headerKeys = values[0].map(headerKey);

  const current = startsWithKeys(
    headerKeys,
    RESERVATION_HEADERS.map(headerKey)
  );

  const legacy = !current && startsWithKeys(
    headerKeys,
    LEGACY_RESERVATION_HEADERS.map(headerKey)
  );

  if (!current && !legacy) {
    throw new Error('Unsupported reservations schema');
  }

  const slotMap = {};

  slots.records.forEach(function (slot) {
    slotMap[slot.slotId] = slot;
  });

  const records = [];

  for (let index = 1; index < values.length; index++) {
    const row = values[index];
    const reservationId = normalizeText(row[0]);

    if (!reservationId) continue;

    if (current) {
      records.push({
        rowIndex: index + 1,
        reservationId: reservationId,
        slotId: normalizeText(row[1]),
        date: formatDateValue(row[2]),
        time: formatTimeValue(row[3]),
        status: normalizeText(row[4]).toLowerCase(),
        name: normalizeText(row[5]),
        studentId: normalizeText(row[6]),
        phone: normalizeText(row[7]),
        course: normalizeText(row[8]),
        courseProf: normalizeText(row[9]),
        createdAt: formatDateTimeValue(row[10]),
        cancelledAt: formatDateTimeValue(row[11])
      });

      continue;
    }

    const slotId = normalizeText(row[1]);
    const slot = slotMap[slotId];

    records.push({
      rowIndex: index + 1,
      reservationId: reservationId,
      slotId: slotId,
      date: slot ? slot.date : '',
      time: slot ? slot.time : '',
      status: normalizeText(row[2]).toLowerCase(),
      name: normalizeText(row[3]),
      studentId: normalizeText(row[4]),
      phone: normalizeText(row[5]),
      course: normalizeText(row[6]),
      courseProf: normalizeText(row[7]),
      createdAt: formatDateTimeValue(row[8]),
      cancelledAt: formatDateTimeValue(row[9])
    });
  }

  return records;
}

function reservationRecordsForRead(slots) {
  const sheet = getReservationSheet();

  const records = sheet
    ? readReservations(sheet, slots)
    : [];

  const knownIds = new Set(
    records.map(function (reservation) {
      return reservation.reservationId;
    })
  );

  slots.records.forEach(function (slot) {
    if (!slot.legacy || slot.status !== 'booked') return;

    const reservationId = legacyReservationId(slot.slotId);

    if (knownIds.has(reservationId)) return;

    records.push(legacyReservation(slot));
    knownIds.add(reservationId);
  });

  return records;
}

function ensureCapacityDatabaseInternal() {
  const slots = readSlots();
  const sheet = getOrCreateReservationSheet();

  ensureReservationSchema(sheet, slots);

  const migration = migrateLegacyBookings(slots, sheet);

  if (migration.count) {
    commitDataChange();
  }

  return {
    slots: slots,
    reservationSheet: sheet,
    reservations: migration.reservations,
    migratedCount: migration.count
  };
}

function ensureReservationSchema(sheet, slots) {
  if (sheet.getLastRow() === 0) {
    writeReservationSheet(sheet, []);
    return;
  }

  const values = sheet.getDataRange().getValues();
  const keys = values[0].map(headerKey);

  if (
    startsWithKeys(
      keys,
      RESERVATION_HEADERS.map(headerKey)
    )
  ) {
    return;
  }

  if (
    startsWithKeys(
      keys,
      LEGACY_RESERVATION_HEADERS.map(headerKey)
    )
  ) {
    const records = readReservations(sheet, slots);
    writeReservationSheet(sheet, records);
    return;
  }

  throw new Error('Unsupported reservations schema');
}

function migrateLegacyBookings(slots, sheet) {
  const reservations = readReservations(sheet, slots);

  const knownIds = new Set(
    reservations.map(function (reservation) {
      return reservation.reservationId;
    })
  );

  const additions = [];

  slots.records.forEach(function (slot) {
    if (!slot.legacy || slot.status !== 'booked') return;

    const reservationId = legacyReservationId(slot.slotId);

    if (knownIds.has(reservationId)) return;

    additions.push(legacyReservation(slot));
    knownIds.add(reservationId);
  });

  if (additions.length) {
    const firstRow = sheet.getLastRow() + 1;

    const range = sheet.getRange(
      firstRow,
      1,
      additions.length,
      RESERVATION_HEADERS.length
    );

    range.setNumberFormat('@');
    range.setValues(
      additions.map(reservationValues)
    );

    additions.forEach(function (reservation, index) {
      reservation.rowIndex = firstRow + index;
      reservations.push(reservation);
    });
  }

  return {
    count: additions.length,
    reservations: reservations
  };
}

function legacyReservation(slot) {
  const participant = slot.legacyParticipant || {};

  return {
    rowIndex: null,
    reservationId: legacyReservationId(slot.slotId),
    slotId: slot.slotId,
    date: slot.date,
    time: slot.time,
    status: 'booked',
    name: participant.name || '',
    studentId: participant.studentId || '',
    phone: participant.phone || '',
    course: participant.course || '',
    courseProf: participant.courseProf || '',
    createdAt: participant.createdAt || '',
    cancelledAt: ''
  };
}

function reservationValues(reservation) {
  return [
    reservation.reservationId,
    reservation.slotId,
    reservation.date,
    reservation.time,
    reservation.status,
    reservation.name,
    reservation.studentId,
    reservation.phone,
    reservation.course,
    reservation.courseProf,
    reservation.createdAt,
    reservation.cancelledAt
  ];
}

function appendReservation(sheet, reservation) {
  const range = sheet.getRange(
    sheet.getLastRow() + 1,
    1,
    1,
    RESERVATION_HEADERS.length
  );

  range.setNumberFormat('@');
  range.setValues([
    reservationValues(reservation)
  ]);
}

function writeReservationSheet(sheet, reservations) {
  const rows = [
    RESERVATION_HEADERS
  ].concat(
    reservations.map(reservationValues)
  );

  sheet.clearContents();

  const range = sheet.getRange(
    1,
    1,
    rows.length,
    RESERVATION_HEADERS.length
  );

  range.setNumberFormat('@');
  range.setValues(rows);
  sheet.setFrozenRows(1);
}

function findSlot(slots, slotId) {
  const target = normalizeText(slotId);

  return slots.records.find(function (slot) {
    return slot.slotId === target;
  }) || null;
}

function capacityOf(slot) {
  const capacity = Number(slot.capacity);

  if (!Number.isInteger(capacity) || capacity < 1) {
    return SLOT_CAPACITY;
  }

  return Math.min(capacity, SLOT_CAPACITY);
}

function isStoredSlotOpen(status) {
  return status === 'open' ||
    status === 'available' ||
    status === 'booked';
}

function operationStatusOf(slot) {
  return isStoredSlotOpen(slot.status)
    ? 'open'
    : 'closed';
}

function bookingStatusOf(slot, bookedCount) {
  if (!isStoredSlotOpen(slot.status)) {
    return 'closed';
  }

  if (isPast(slot.date, slot.time)) {
    return 'expired';
  }

  if (bookedCount >= capacityOf(slot)) {
    return 'booked';
  }

  return 'available';
}

function slotSummaryValues(slot, bookedCount) {
  const capacity = capacityOf(slot);

  return [
    bookedCount,
    Math.max(0, capacity - bookedCount),
    bookingStatusOf(slot, bookedCount)
  ];
}

function bookedCounts(reservations) {
  const counts = {};

  reservations.forEach(function (reservation) {
    if (reservation.status !== 'booked') return;

    counts[reservation.slotId] =
      (counts[reservation.slotId] || 0) + 1;
  });

  return counts;
}

function updateSlotSummary(slots, slot, bookedCount) {
  if (slots.schema !== 'summary') return;

  slots.sheet
    .getRange(slot.rowIndex, 6, 1, 3)
    .setValues([
      slotSummaryValues(slot, bookedCount)
    ]);
}

function syncAllSlotSummariesInternal(database) {
  const slots = database.slots;

  if (slots.schema !== 'summary') {
    return false;
  }

  const counts = bookedCounts(database.reservations);
  const rowCount = slots.sheet.getLastRow() - 1;

  if (rowCount < 1) return true;

  const values = Array.from(
    { length: rowCount },
    function () {
      return ['', '', '', '', ''];
    }
  );

  slots.records.forEach(function (slot) {
    const operationStatus = operationStatusOf(slot);
    const capacity = capacityOf(slot);

    slot.status = operationStatus;
    slot.capacity = capacity;

    values[slot.rowIndex - 2] = [
      operationStatus,
      capacity
    ].concat(
      slotSummaryValues(
        slot,
        counts[slot.slotId] || 0
      )
    );
  });

  const range = slots.sheet.getRange(
    2,
    4,
    rowCount,
    5
  );

  range.setValues(values);

  range
    .offset(0, 1, rowCount, 3)
    .setNumberFormat('0');

  return true;
}

function prepareCapacityDatabase() {
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);

  try {
    const result = ensureCapacityDatabaseInternal();

    if (syncAllSlotSummariesInternal(result)) {
      commitDataChange();
    }

    SpreadsheetApp.getUi().alert(
      'DB 준비 완료\n기존 예약 ' +
      result.migratedCount +
      '건 추가'
    );
  } finally {
    lock.releaseLock();
  }
}

function verifyCapacityDatabase() {
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);

  try {
    const slots = readSlots();
    const sheet = getReservationSheet();
    const reservations = reservationRecordsForRead(slots);
    const slotMap = {};
    const counts = bookedCounts(reservations);
    const issues = [];

    slots.records.forEach(function (slot) {
      slotMap[slot.slotId] = slot;
    });

    reservations.forEach(function (reservation) {
      if (!slotMap[reservation.slotId]) {
        issues.push(
          '없는 슬롯 예약: ' +
          reservation.reservationId
        );
      }
    });

    Object.keys(counts).forEach(function (slotId) {
      const slot = slotMap[slotId];

      if (
        slot &&
        counts[slotId] > capacityOf(slot)
      ) {
        issues.push(
          '정원 초과: ' +
          slotId +
          ' (' +
          counts[slotId] +
          '명)'
        );
      }
    });

    if (slots.schema === 'summary') {
      slots.records.forEach(function (slot) {
        const expected = slotSummaryValues(
          slot,
          counts[slot.slotId] || 0
        );

        if (
          slot.bookedCount !== expected[0] ||
          slot.remaining !== expected[1] ||
          slot.bookingStatus !== expected[2]
        ) {
          issues.push(
            '요약 불일치: ' +
            slot.slotId
          );
        }
      });
    }

    if (!sheet) {
      issues.unshift(
        'reservations 시트가 없습니다. DB 준비를 실행하세요.'
      );
    }

    const bookedCount = reservations.filter(
      function (reservation) {
        return reservation.status === 'booked';
      }
    ).length;

    const cancelledCount = reservations.filter(
      function (reservation) {
        return reservation.status === 'cancelled';
      }
    ).length;

    const detail = issues.length
      ? '\n\n문제\n- ' +
        issues.slice(0, 10).join('\n- ')
      : '\n\n문제 없음';

    SpreadsheetApp.getUi().alert(
      '슬롯 ' +
      slots.records.length +
      '개' +
      '\n예약 중 ' +
      bookedCount +
      '건' +
      '\n취소 ' +
      cancelledCount +
      '건' +
      detail
    );
  } finally {
    lock.releaseLock();
  }
}

function finalizeCapacityDatabase() {
  const ui = SpreadsheetApp.getUi();

  const answer = ui.alert(
    'slots 시트를 운영 상태와 예약 요약 열로 정리합니다. 계속할까요?',
    ui.ButtonSet.YES_NO
  );

  if (answer !== ui.Button.YES) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);

  try {
    const database = ensureCapacityDatabaseInternal();
    const slots = database.slots;

    if (slots.schema === 'summary') {
      syncAllSlotSummariesInternal(database);
      commitDataChange();
      ui.alert('요약 상태를 다시 계산했습니다.');
      return;
    }

    const reservations = database.reservations;

    const knownIds = new Set(
      reservations.map(function (reservation) {
        return reservation.reservationId;
      })
    );

    slots.records.forEach(function (slot) {
      if (
        slot.status === 'booked' &&
        !knownIds.has(
          legacyReservationId(slot.slotId)
        )
      ) {
        throw new Error(
          'Migration is incomplete: ' +
          slot.slotId
        );
      }
    });

    const counts = bookedCounts(reservations);

    const rows = slots.records.map(function (slot) {
      const bookedCount = counts[slot.slotId] || 0;
      const summary = slotSummaryValues(
        slot,
        bookedCount
      );

      return [
        slot.slotId,
        slot.date,
        slot.time,
        operationStatusOf(slot),
        capacityOf(slot),
        summary[0],
        summary[1],
        summary[2],
        slot.note || ''
      ];
    });

    const sheet = slots.sheet;

    sheet.clearContents();

    const output = [
      SLOT_HEADERS
    ].concat(rows);

    const range = sheet.getRange(
      1,
      1,
      output.length,
      SLOT_HEADERS.length
    );

    range.setNumberFormat('@');
    range.setValues(output);

    if (rows.length) {
      sheet
        .getRange(2, 5, rows.length, 3)
        .setNumberFormat('0');
    }

    sheet.setFrozenRows(1);

    commitDataChange();

    ui.alert(
      'slots 시트 정리가 완료되었습니다.'
    );
  } finally {
    lock.releaseLock();
  }
}

function syncSlotSummaries() {
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);

  try {
    const database = ensureCapacityDatabaseInternal();

    if (!syncAllSlotSummariesInternal(database)) {
      SpreadsheetApp.getUi().alert(
        '먼저 슬롯 구조 정리를 실행하세요.'
      );
      return;
    }

    commitDataChange();

    SpreadsheetApp.getUi().alert(
      '슬롯 요약 상태를 갱신했습니다.'
    );
  } finally {
    lock.releaseLock();
  }
}

function onEdit(event) {
  if (!event || !event.range) return;

  const range = event.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== SLOT_SHEET_NAME) return;
  if (range.getLastRow() < 2) return;

  if (
    range.getLastColumn() < 2 ||
    range.getColumn() > 8
  ) {
    return;
  }

  clearSlotCache();

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) return;

  try {
    const slots = readSlots();

    if (slots.schema !== 'summary') return;

    const reservations =
      reservationRecordsForRead(slots);

    const counts = bookedCounts(reservations);
    const firstRow = Math.max(2, range.getRow());
    const lastRow = range.getLastRow();
    const rowCount = lastRow - firstRow + 1;

    const outputRange = sheet.getRange(
      firstRow,
      4,
      rowCount,
      5
    );

    const output = outputRange.getValues();

    slots.records.forEach(function (slot) {
      if (
        slot.rowIndex < firstRow ||
        slot.rowIndex > lastRow
      ) {
        return;
      }

      const operationStatus =
        operationStatusOf(slot);

      const capacity = capacityOf(slot);

      slot.status = operationStatus;
      slot.capacity = capacity;

      output[slot.rowIndex - firstRow] = [
        operationStatus,
        capacity
      ].concat(
        slotSummaryValues(
          slot,
          counts[slot.slotId] || 0
        )
      );
    });

    outputRange.setValues(output);

    outputRange
      .offset(0, 1, rowCount, 3)
      .setNumberFormat('0');

    commitDataChange();
  } catch (error) {
    console.error(error);
  } finally {
    lock.releaseLock();
  }
}

function sortReservationsBySlot() {
  sortReservations(
    [
      { column: 3, ascending: true },
      { column: 4, ascending: true },
      { column: 11, ascending: true }
    ],
    '시간대순 정렬 완료'
  );
}

function sortReservationsByCreatedAt() {
  sortReservations(
    [
      { column: 11, ascending: true }
    ],
    '예약 접수순 정렬 완료'
  );
}

function sortReservations(sortSpec, message) {
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);

  try {
    const database = ensureCapacityDatabaseInternal();
    const sheet = database.reservationSheet;
    const rowCount = sheet.getLastRow() - 1;

    if (rowCount > 1) {
      sheet
        .getRange(
          2,
          1,
          rowCount,
          RESERVATION_HEADERS.length
        )
        .sort(sortSpec);
    }

    SpreadsheetApp.getUi().alert(message);
  } finally {
    lock.releaseLock();
  }
}

function generateSlots() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  let sheet =
    spreadsheet.getSheetByName(
      SLOT_SHEET_NAME
    );

  if (!sheet) {
    sheet = spreadsheet.insertSheet(
      SLOT_SHEET_NAME
    );
  }

  if (sheet.getLastRow() === 0) {
    sheet
      .getRange(
        1,
        1,
        1,
        SLOT_HEADERS.length
      )
      .setValues([SLOT_HEADERS]);
  }

  const slots = readSlots();

  const existing = new Set(
    slots.records.map(function (slot) {
      return slot.slotId;
    })
  );

  const start = parseDateKey(
    SCHEDULE.startDate
  );

  const end = parseDateKey(
    SCHEDULE.endDate
  );

  if (start.getTime() > end.getTime()) {
    throw new Error(
      'Invalid schedule date range'
    );
  }

  const times = timeSlots();
  const rows = [];

  for (
    let date = new Date(start);
    date <= end;
    date.setUTCDate(
      date.getUTCDate() + 1
    )
  ) {
    const day = date.getUTCDay();

    if (
      SCHEDULE.weekdaysOnly &&
      (day === 0 || day === 6)
    ) {
      continue;
    }

    const dateText = utcDateKey(date);

    times.forEach(function (time) {
      const slotId =
        dateText + '_' + time;

      if (existing.has(slotId)) return;

      if (slots.schema === 'legacy') {
        rows.push([
          slotId,
          dateText,
          time,
          'available',
          '',
          '',
          '',
          '',
          '',
          ''
        ]);
      } else if (
        slots.schema === 'compact'
      ) {
        rows.push([
          slotId,
          dateText,
          time,
          'open',
          SLOT_CAPACITY,
          ''
        ]);
      } else {
        rows.push([
          slotId,
          dateText,
          time,
          'open',
          SLOT_CAPACITY,
          0,
          SLOT_CAPACITY,
          'available',
          ''
        ]);
      }

      existing.add(slotId);
    });
  }

  if (!rows.length) {
    SpreadsheetApp.getUi().alert(
      '추가할 슬롯이 없습니다.'
    );
    return;
  }

  const columnCount =
    slots.schema === 'legacy'
      ? 10
      : slots.schema === 'compact'
        ? COMPACT_SLOT_HEADERS.length
        : SLOT_HEADERS.length;

  const range = sheet.getRange(
    sheet.getLastRow() + 1,
    1,
    rows.length,
    columnCount
  );

  range.setNumberFormat('@');
  range.setValues(rows);

  if (slots.schema === 'compact') {
    sheet
      .getRange(
        range.getRow(),
        5,
        rows.length,
        1
      )
      .setNumberFormat('0');
  } else if (
    slots.schema === 'summary'
  ) {
    sheet
      .getRange(
        range.getRow(),
        5,
        rows.length,
        3
      )
      .setNumberFormat('0');
  }

  commitDataChange();

  SpreadsheetApp.getUi().alert(
    rows.length +
    '개 슬롯을 추가했습니다.'
  );
}

function getSlotSheet() {
  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        SLOT_SHEET_NAME
      );

  if (!sheet) {
    throw new Error(
      'Sheet not found: ' +
      SLOT_SHEET_NAME
    );
  }

  return sheet;
}

function getReservationSheet() {
  return SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(
      RESERVATION_SHEET_NAME
    );
}

function getOrCreateReservationSheet() {
  return getReservationSheet() ||
    SpreadsheetApp
      .getActiveSpreadsheet()
      .insertSheet(
        RESERVATION_SHEET_NAME
      );
}

function readSlotCache() {
  try {
    const cached =
      CacheService
        .getScriptCache()
        .get(SLOT_CACHE_KEY);

    return cached
      ? JSON.parse(cached)
      : null;
  } catch (error) {
    console.warn(
      'slot_cache_read_failed ' +
      error
    );

    return null;
  }
}

function writeSlotCache(payload) {
  try {
    CacheService
      .getScriptCache()
      .put(
        SLOT_CACHE_KEY,
        JSON.stringify(payload),
        SLOT_CACHE_SECONDS
      );
  } catch (error) {
    console.warn(
      'slot_cache_write_failed ' +
      error
    );
  }
}

function clearSlotCache() {
  try {
    CacheService
      .getScriptCache()
      .remove(
        SLOT_CACHE_KEY
      );
  } catch (error) {
    console.warn(
      'slot_cache_clear_failed ' +
      error
    );
  }
}

function commitDataChange() {
  SpreadsheetApp.flush();
  clearSlotCache();
}

function timeSlots() {
  const start = timeToMinutes(
    SCHEDULE.openTime
  );

  const end = timeToMinutes(
    SCHEDULE.lastStartTime
  );

  const step = Number(
    SCHEDULE.slotMinutes
  );

  if (
    start > end ||
    !Number.isInteger(step) ||
    step <= 0
  ) {
    throw new Error(
      'Invalid schedule settings'
    );
  }

  const times = [];

  for (
    let minute = start;
    minute <= end;
    minute += step
  ) {
    times.push(
      minutesToTime(minute)
    );
  }

  return times;
}

function timeToMinutes(value) {
  const match =
    /^(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    throw new Error(
      'Invalid time: ' +
      value
    );
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour > 23 ||
    minute > 59
  ) {
    throw new Error(
      'Invalid time: ' +
      value
    );
  }

  return hour * 60 + minute;
}

function minutesToTime(totalMinutes) {
  const hour =
    Math.floor(totalMinutes / 60);

  const minute =
    totalMinutes % 60;

  return String(hour).padStart(2, '0') +
    ':' +
    String(minute).padStart(2, '0');
}

function slotTimeMs(date, time) {
  return new Date(
    date +
    'T' +
    time +
    ':00+09:00'
  ).getTime();
}

function isPast(date, time) {
  return slotTimeMs(date, time) <=
    Date.now();
}

function canCancel(date, time) {
  return (
    slotTimeMs(date, time) -
    Date.now()
  ) >= (
    POLICY.cancelDeadlineHours *
    3600000
  );
}

function compareSlots(first, second) {
  return (
    first.date +
    ' ' +
    first.time
  ).localeCompare(
    second.date +
    ' ' +
    second.time
  );
}

function parseDateKey(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error(
      'Invalid date: ' +
      value
    );
  }

  const date = new Date(
    value +
    'T00:00:00Z'
  );

  if (
    isNaN(date.getTime()) ||
    utcDateKey(date) !== value
  ) {
    throw new Error(
      'Invalid date: ' +
      value
    );
  }

  return date;
}

function utcDateKey(date) {
  return date.getUTCFullYear() +
    '-' +
    String(
      date.getUTCMonth() + 1
    ).padStart(2, '0') +
    '-' +
    String(
      date.getUTCDate()
    ).padStart(2, '0');
}

function formatDateValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      TZ,
      'yyyy-MM-dd'
    );
  }

  return normalizeText(value);
}

function formatTimeValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      TZ,
      'HH:mm'
    );
  }

  return normalizeText(value);
}

function formatDateTimeValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      TZ,
      'yyyy-MM-dd HH:mm:ss'
    );
  }

  return normalizeText(value);
}

function nowText() {
  return Utilities.formatDate(
    new Date(),
    TZ,
    'yyyy-MM-dd HH:mm:ss'
  );
}

function normalizeText(value) {
  return String(
    value == null ? '' : value
  )
    .trim()
    .normalize('NFC');
}

function headerKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      ''
    );
}

function startsWithKeys(
  actual,
  expected
) {
  if (
    actual.length <
    expected.length
  ) {
    return false;
  }

  for (
    let index = 0;
    index < expected.length;
    index++
  ) {
    if (
      actual[index] !==
      expected[index]
    ) {
      return false;
    }
  }

  return true;
}

function legacyReservationId(slotId) {
  return 'legacy_' +
    slotId.replace(
      /[^0-9A-Za-z_-]/g,
      '-'
    );
}

function json(value) {
  return ContentService
    .createTextOutput(
      JSON.stringify(value)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}

function onOpen() {
  SpreadsheetApp
    .getUi()
    .createMenu('CNL 예약')
    .addItem(
      '슬롯 생성',
      'generateSlots'
    )
    .addSeparator()
    .addItem(
      '3명 정원 DB 준비',
      'prepareCapacityDatabase'
    )
    .addItem(
      'DB 상태 점검',
      'verifyCapacityDatabase'
    )
    .addItem(
      '슬롯 구조 및 개인정보 정리',
      'finalizeCapacityDatabase'
    )
    .addItem(
      '슬롯 요약 상태 동기화',
      'syncSlotSummaries'
    )
    .addSeparator()
    .addItem(
      '예약을 시간대순 정렬',
      'sortReservationsBySlot'
    )
    .addItem(
      '예약을 접수순 정렬',
      'sortReservationsByCreatedAt'
    )
    .addToUi();
}

function test_슬롯상태() {
  const payload = buildSlotPayload();

  const slot = payload.slots.find(
    function (item) {
      return item.slotId === TEST_SLOT;
    }
  );

  Logger.log(
    JSON.stringify(
      slot || {
        error: 'TEST_SLOT not found'
      }
    )
  );
}