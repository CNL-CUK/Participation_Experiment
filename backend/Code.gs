const SHEET_NAME = 'slots';
const TZ = 'Asia/Seoul';
const LOCK_WAIT_MS = 10000;
const SLOT_CACHE_KEY = 'slot-payload-v1';
const SLOT_CACHE_SECONDS = 15;

// 실험 일정, 운영 시간 수정
const SCHEDULE = {
  startDate: '2026-08-31',
  endDate: '2026-09-18',
  openTime: '09:00',
  lastStartTime: '18:00',
  slotMinutes: 60,
  weekdaysOnly: true
};

// 프론트엔드 src/config.js와 동일하게 유지
const POLICY = {
  cancelDeadlineHours: 3,
  studentIdLength: 9
};

// 테스트 시 실제 예약이 없는 슬롯으로
const TEST_SLOT = '2026-08-31_09:00';

const COL = {
  slotId: 1,
  date: 2,
  time: 3,
  status: 4,
  name: 5,
  studentId: 6,
  phone: 7,
  course: 8,
  courseProf: 9,
  createdAt: 10
};

const HEADERS = [
  'slotId',
  'date',
  'time',
  'status',
  'name',
  'studentId',
  'phone',
  'course',
  'courseProf',
  'createdAt'
];

const INPUT_LIMIT = {
  name: 50,
  course: 100,
  courseProf: 50
};

const WRITE_START = COL.status;
const WRITE_LEN = COL.createdAt - COL.status + 1;
const SAFE_STATUS = { available: true, booked: true, closed: true };
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
    if (request.action === 'book') return withLock(function () { return book(request); });
    if (request.action === 'cancel') return withLock(function () { return cancel(request); });
    return json({ ok: false, reason: 'unknown_action' });
  } catch (error) {
    console.error(error);
    return json({ ok: false, reason: 'server_error' });
  }
}

function withLock(callback) {
  const lock = LockService.getScriptLock();
  const waitStartedAt = Date.now();

  if (!lock.tryLock(LOCK_WAIT_MS)) {
    console.warn('slot_lock_timeout waitedMs=' + (Date.now() - waitStartedAt));
    return json({ ok: false, reason: 'busy' });
  }

  const acquiredAt = Date.now();
  try {
    return callback();
  } finally {
    lock.releaseLock();
    console.log(
      'slot_lock waitedMs=' + (acquiredAt - waitStartedAt) +
      ' heldMs=' + (Date.now() - acquiredAt)
    );
  }
}

function book(request) {
  const input = participantInput(request);
  if (!input.ok) return json({ ok: false, reason: input.reason });
  if (!isValidSlotId(request.slotId)) return json({ ok: false, reason: 'invalid_input' });

  const found = findSlot(request.slotId);
  if (!found) return json({ ok: false, reason: 'not_found' });
  if (normalizeText(cell(found.data, 'status')) !== 'available') {
    return json({ ok: false, reason: 'already_booked' });
  }

  const date = formatDateValue(cell(found.data, 'date'));
  const time = formatTimeValue(cell(found.data, 'time'));
  if (isPast(date, time)) return json({ ok: false, reason: 'expired' });

  const createdAt = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
  const range = found.sheet.getRange(found.index, WRITE_START, 1, WRITE_LEN);
  range.setValues([[
    'booked',
    input.name,
    input.studentId,
    input.phone,
    input.course,
    input.courseProf,
    createdAt
  ]]);
  commitSlotChange();

  return json({ ok: true, slotId: normalizeText(request.slotId), date: date, time: time });
}

function cancel(request) {
  const identity = identityInput(request);
  if (!identity.ok) return json({ ok: false, reason: identity.reason });
  if (!isValidSlotId(request.slotId)) return json({ ok: false, reason: 'invalid_input' });

  const found = findSlot(request.slotId);
  if (!found) return json({ ok: false, reason: 'not_found' });
  if (normalizeText(cell(found.data, 'status')) !== 'booked') {
    return json({ ok: false, reason: 'not_booked' });
  }

  const nameMatches = normalizeText(cell(found.data, 'name')) === identity.name;
  const idMatches = normalizeText(cell(found.data, 'studentId')) === identity.studentId;
  if (!nameMatches || !idMatches) return json({ ok: false, reason: 'no_match' });

  const date = formatDateValue(cell(found.data, 'date'));
  const time = formatTimeValue(cell(found.data, 'time'));
  if (!canCancel(date, time)) return json({ ok: false, reason: 'too_late' });

  found.sheet.getRange(found.index, WRITE_START, 1, WRITE_LEN).setValues([[
    'available', '', '', '', '', '', ''
  ]]);
  commitSlotChange();
  return json({ ok: true });
}

function lookup(request) {
  const identity = identityInput(request);
  if (!identity.ok) return json({ ok: false, reason: identity.reason });

  const rows = getSheet().getDataRange().getValues();
  const reservations = [];

  for (let index = 1; index < rows.length; index++) {
    if (normalizeText(cell(rows[index], 'status')) !== 'booked') continue;
    if (normalizeText(cell(rows[index], 'name')) !== identity.name) continue;
    if (normalizeText(cell(rows[index], 'studentId')) !== identity.studentId) continue;

    const date = formatDateValue(cell(rows[index], 'date'));
    const time = formatTimeValue(cell(rows[index], 'time'));
    reservations.push({
      slotId: normalizeText(cell(rows[index], 'slotId')),
      date: date,
      time: time,
      cancelable: canCancel(date, time),
      past: isPast(date, time)
    });
  }

  reservations.sort(compareSlots);
  return json({ ok: true, reservations: reservations });
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
  if (!new RegExp('^\\d{' + POLICY.studentIdLength + '}$').test(studentId)) {
    return { ok: false, reason: 'invalid_student_id' };
  }

  return { ok: true, name: name, studentId: studentId };
}

function isValidText(value, maxLength, required) {
  if (!value) return !required;
  return value.length <= maxLength && !UNSAFE_PREFIX.test(value);
}

function isValidSlotId(value) {
  return /^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}$/.test(normalizeText(value));
}

function normalizeText(value) {
  return String(value == null ? '' : value).trim().normalize('NFC');
}

function findSlot(slotId) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  const target = normalizeText(slotId);

  for (let index = 1; index < rows.length; index++) {
    if (normalizeText(cell(rows[index], 'slotId')) === target) {
      return { sheet: sheet, index: index + 1, data: rows[index] };
    }
  }

  return null;
}

function buildSlotPayload() {
  const rows = getSheet().getDataRange().getValues();
  const slots = [];

  for (let index = 1; index < rows.length; index++) {
    if (!cell(rows[index], 'slotId')) continue;

    const date = formatDateValue(cell(rows[index], 'date'));
    const time = formatTimeValue(cell(rows[index], 'time'));
    const storedStatus = normalizeText(cell(rows[index], 'status'));
    let status = SAFE_STATUS[storedStatus] ? storedStatus : 'closed';

    if (status === 'available' && isPast(date, time)) status = 'expired';

    slots.push({
      slotId: normalizeText(cell(rows[index], 'slotId')),
      date: date,
      time: time,
      status: status
    });
  }

  slots.sort(compareSlots);
  return {
    ok: true,
    times: timeSlots(),
    slotMinutes: SCHEDULE.slotMinutes,
    slots: slots
  };
}

function readSlotCache() {
  try {
    const cached = CacheService.getScriptCache().get(SLOT_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn('slot_cache_read_failed ' + error);
    return null;
  }
}

function writeSlotCache(payload) {
  try {
    CacheService.getScriptCache().put(
      SLOT_CACHE_KEY,
      JSON.stringify(payload),
      SLOT_CACHE_SECONDS
    );
  } catch (error) {
    console.warn('slot_cache_write_failed ' + error);
  }
}

function clearSlotCache() {
  try {
    CacheService.getScriptCache().remove(SLOT_CACHE_KEY);
  } catch (error) {
    console.warn('slot_cache_clear_failed ' + error);
  }
}

function commitSlotChange() {
  SpreadsheetApp.flush();
  clearSlotCache();
}

function timeSlots() {
  const start = timeToMinutes(SCHEDULE.openTime);
  const end = timeToMinutes(SCHEDULE.lastStartTime);
  const step = Number(SCHEDULE.slotMinutes);

  if (start > end || !Number.isInteger(step) || step <= 0) {
    throw new Error('Invalid schedule settings');
  }

  const times = [];
  for (let minute = start; minute <= end; minute += step) {
    times.push(minutesToTime(minute));
  }
  return times;
}

function timeToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Invalid time: ' + value);

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('Invalid time: ' + value);
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}

function slotTimeMs(date, time) {
  return new Date(date + 'T' + time + ':00+09:00').getTime();
}

function isPast(date, time) {
  return slotTimeMs(date, time) <= Date.now();
}

function canCancel(date, time) {
  return slotTimeMs(date, time) - Date.now() >= POLICY.cancelDeadlineHours * 3600000;
}

function compareSlots(first, second) {
  return (first.date + ' ' + first.time).localeCompare(second.date + ' ' + second.time);
}

function getSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);
  return sheet;
}

function cell(row, key) {
  return row[COL[key] - 1];
}

function formatDateValue(value) {
  if (value instanceof Date) return Utilities.formatDate(value, TZ, 'yyyy-MM-dd');
  return normalizeText(value);
}

function formatTimeValue(value) {
  if (value instanceof Date) return Utilities.formatDate(value, TZ, 'HH:mm');
  return normalizeText(value);
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function generateSlots() {
  const sheet = getSheet();
  ensureHeader(sheet);

  const existing = new Set();
  const rows = sheet.getDataRange().getValues();
  for (let index = 1; index < rows.length; index++) {
    const slotId = normalizeText(cell(rows[index], 'slotId'));
    if (slotId) existing.add(slotId);
  }

  const start = parseDateKey(SCHEDULE.startDate);
  const end = parseDateKey(SCHEDULE.endDate);
  if (start.getTime() > end.getTime()) throw new Error('Invalid schedule date range');

  const times = timeSlots();
  const newRows = [];

  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.getUTCDay();
    if (SCHEDULE.weekdaysOnly && (day === 0 || day === 6)) continue;

    const dateText = Utilities.formatDate(date, TZ, 'yyyy-MM-dd');
    for (let index = 0; index < times.length; index++) {
      const slotId = dateText + '_' + times[index];
      if (existing.has(slotId)) continue;
      newRows.push([slotId, dateText, times[index], 'available', '', '', '', '', '', '']);
    }
  }

  if (!newRows.length) {
    SpreadsheetApp.getUi().alert('추가할 슬롯이 없습니다.');
    return;
  }

  const range = sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, HEADERS.length);
  range.setNumberFormat('@');
  range.setValues(newRows);
  commitSlotChange();
  SpreadsheetApp.getUi().alert(newRows.length + '개 슬롯을 추가했습니다.');
}

function parseDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid date: ' + value);
  const date = new Date(value + 'T00:00:00Z');
  if (isNaN(date.getTime())) throw new Error('Invalid date: ' + value);
  return date;
}

function ensureHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CNL 예약')
    .addItem('슬롯 생성', 'generateSlots')
    .addToUi();
}

function callPost(payload) {
  const response = doPost({ postData: { contents: JSON.stringify(payload) } });
  Logger.log(response.getContent());
  return response.getContent();
}

function test1_예약하기() {
  callPost({
    action: 'book',
    slotId: TEST_SLOT,
    name: '테스트',
    studentId: '000000000',
    phone: '010-0000-0000',
    course: '인지심리학',
    courseProf: '홍길동'
  });
}

function test2_중복예약() {
  callPost({
    action: 'book',
    slotId: TEST_SLOT,
    name: '다른사람',
    studentId: '999999999',
    phone: '010-9999-9999'
  });
}

function test3_필수값누락() {
  callPost({
    action: 'book',
    slotId: TEST_SLOT,
    name: '',
    studentId: '111111111',
    phone: '010-1111-1111'
  });
}

function test4_취소_정보불일치() {
  callPost({
    action: 'cancel',
    slotId: TEST_SLOT,
    name: '엉뚱한이름',
    studentId: '000000000'
  });
}

function test5_취소_정상() {
  callPost({
    action: 'cancel',
    slotId: TEST_SLOT,
    name: '테스트',
    studentId: '000000000'
  });
}
