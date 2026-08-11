export const DAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

const SEOUL_DATE_FORMATTER = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function toDate(key) {
  return new Date(`${key}T00:00:00Z`);
}

export function toKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayKey() {
  const parts = Object.fromEntries(
    SEOUL_DATE_FORMATTER.formatToParts(new Date()).map(({ type, value }) => [type, value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDate(key) {
  const date = toDate(key);
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${DAY_LABEL[date.getUTCDay()]})`;
}

export function formatShort(key) {
  const date = toDate(key);
  return `${date.getUTCMonth() + 1}.${date.getUTCDate()}`;
}

export function formatCompact(key) {
  const date = toDate(key);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()} (${DAY_LABEL[date.getUTCDay()]})`;
}

export function formatMonth(monthKey) {
  const [year, month] = monthKey.split('-');
  return `${year}년 ${Number(month)}월`;
}

export function monthOf(key) {
  return key.slice(0, 7);
}

export function shiftMonth(monthKey, amount) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function mondayOfWeek(key) {
  const date = toDate(key);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return toKey(date);
}

export function shiftDate(key, amount) {
  const date = toDate(key);
  date.setUTCDate(date.getUTCDate() + amount);
  return toKey(date);
}

export function formatWeekRange(mondayKey) {
  return `${formatShort(mondayKey)}~${formatShort(shiftDate(mondayKey, 4))}`;
}

export function monthCells(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(Date.UTC(year, month - 1, 1 - first.getUTCDay()));

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      key: toKey(date),
      dayNumber: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1,
    };
  });
}

export function openRangeOfDay(row, times) {
  const open = times.filter((time) => row[time]?.status === 'available');
  return open.length ? `${open[0]} – ${open[open.length - 1]}` : '';
}

export function openDates(dates, byDate, times) {
  return dates.filter((date) =>
    times.some((time) => byDate[date]?.[time]?.status === 'available')
  );
}

export function openRangeLabel(list) {
  if (!list.length) return '마감';
  if (list.length === 1) return formatDateWithoutDay(list[0]);
  return `${formatDateWithoutDay(list[0])} ~ ${formatDateWithoutDay(list[list.length - 1])}`;
}

export function openRangeShort(list) {
  if (!list.length) return '마감';
  if (list.length === 1) return formatShort(list[0]);
  return `${formatShort(list[0])} ~ ${formatShort(list[list.length - 1])}`;
}

function formatDateWithoutDay(key) {
  const date = toDate(key);
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}
