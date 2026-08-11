import { useEffect, useMemo, useState } from 'react';
import TimeGrid from './TimeGrid';
import ParticipantForm from './ParticipantForm';
import {
  formatDate,
  formatCompact,
  formatWeekRange,
  mondayOfWeek,
  openRangeOfDay,
} from '../utils/date';
import { noticeText } from '../config';

const STEPS = ['날짜 선택', '시간 선택', '정보 입력'];

export default function MobileBooking({
  times,
  byDate,
  dates,
  step,
  date,
  time,
  onStep,
  onPickDate,
  onPickTime,
  onSuccess,
  onConflict,
}) {
  const [weekIndex, setWeekIndex] = useState(0);

  const row = date ? byDate[date] || {} : {};
  const selectedSlot = date && time ? row[time] : null;
  const slot = selectedSlot?.status === 'available' ? selectedSlot : null;

  const weeks = useMemo(
    () => Array.from(new Set(dates.map(mondayOfWeek))),
    [dates]
  );

  const safeWeekIndex = Math.min(
    weekIndex,
    Math.max(weeks.length - 1, 0)
  );

  const currentWeek = weeks[safeWeekIndex];

  const weekDates = useMemo(() => {
    if (!currentWeek) return [];
    return dates.filter((d) => mondayOfWeek(d) === currentWeek);
  }, [dates, currentWeek]);

  useEffect(() => {
    if (weekIndex >= weeks.length) {
      setWeekIndex(Math.max(weeks.length - 1, 0));
    }
  }, [weekIndex, weeks.length]);

  useEffect(() => {
    if (!date) return;

    const selectedWeekIndex = weeks.indexOf(mondayOfWeek(date));
    if (selectedWeekIndex >= 0) {
      setWeekIndex(selectedWeekIndex);
    }
  }, [date, weeks]);

  const dateMeta = useMemo(() => {
    return Object.fromEntries(
      dates.map((slotDate) => {
        const dateRow = byDate[slotDate] || {};
        const openCount = times.filter(
          (slotTime) => dateRow[slotTime]?.status === 'available'
        ).length;
        return [slotDate, { openCount, range: openRangeOfDay(dateRow, times) }];
      })
    );
  }, [byDate, dates, times]);

  function moveWeek(direction) {
    const nextIndex = safeWeekIndex + direction;
    if (nextIndex < 0 || nextIndex >= weeks.length) return;

    setWeekIndex(nextIndex);

    if (date && mondayOfWeek(date) !== weeks[nextIndex]) {
      onPickDate(null);
    }
  }

  const maxStep = time ? 3 : date ? 2 : 1;

  return (
    <div className="mb">
      <nav className="mb-steps" aria-label="예약 단계">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const reachable = n <= maxStep;

          return (
            <button
              key={label}
              type="button"
              className={n === step ? 'mb-step is-on' : 'mb-step'}
              aria-current={n === step ? 'step' : undefined}
              disabled={!reachable}
              onClick={() => reachable && onStep(n)}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {step === 1 && (
        <div className="mb-body">
          <div className="mb-head">
            <h2 className="mb-title">날짜를 선택하세요</h2>

            {currentWeek && (
              <div className="mb-week-nav" aria-label="주차 선택">
                <button
                  type="button"
                  className="mb-week-btn"
                  aria-label="이전 주"
                  disabled={safeWeekIndex === 0}
                  onClick={() => moveWeek(-1)}
                >
                  ‹
                </button>

                <strong className="mb-week-range">
                  {formatWeekRange(currentWeek)}
                </strong>

                <button
                  type="button"
                  className="mb-week-btn"
                  aria-label="다음 주"
                  disabled={safeWeekIndex === weeks.length - 1}
                  onClick={() => moveWeek(1)}
                >
                  ›
                </button>
              </div>
            )}
          </div>

          <ul className="mb-list">
            {weekDates.map((d) => {
              const { openCount, range } = dateMeta[d];
              const hasOpenTime = openCount > 0;
              const picked = date === d;

              const itemClass = [
                'mb-item',
                hasOpenTime ? 'is-open' : 'is-full',
                picked ? 'is-picked' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <li key={d}>
                  <button
                    type="button"
                    className={itemClass}
                    aria-pressed={picked}
                    aria-label={`${formatDate(d)} ${
                      hasOpenTime ? '예약 가능' : '마감'
                    }`}
                    onClick={() => onPickDate(d)}
                  >
                    <div>
                      <div className="mb-item-date">{formatDate(d)}</div>

                      <div className="mb-item-sub">
                        {hasOpenTime
                          ? range
                          : '예약 가능한 시간 없음'}
                      </div>
                    </div>

                    <span
                      className={
                        hasOpenTime
                          ? 'mb-item-tail is-accent'
                          : 'mb-item-tail'
                      }
                    >
                      {hasOpenTime ? '예약 가능 ›' : '마감 ›'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {weekDates.length === 0 && (
            <p className="mb-week-empty">
              이 주에는 예약 가능한 날짜가 없습니다.
            </p>
          )}

          <p className="mb-note">{noticeText()}</p>
        </div>
      )}

      {step === 2 && (
        <div className="mb-body">
          <div className="mb-head">
            <h2 className="mb-title">시간을 선택하세요</h2>
            <span className="mb-month">{formatDate(date)}</span>
          </div>

          <div className="mb-card">
            <TimeGrid
              times={times}
              row={row}
              selected={time}
              onSelect={onPickTime}
            />
          </div>

          <p className="mb-note">{noticeText()}</p>
        </div>
      )}

      {step === 3 && (
        <div className="mb-body">
          <div className="mb-summary">
            <div className="mb-summary-when">
              {formatDate(date)} {time}
            </div>
            <div className="mb-summary-where">
              선택한 시간이 맞는지 확인해 주세요
            </div>
          </div>

          <div className="mb-card">
            <ParticipantForm
              slot={slot}
              onSuccess={onSuccess}
              onConflict={onConflict}
              compact
            />
          </div>
        </div>
      )}

      {step < 3 && (
        <div className="mb-bar">
          <div className="mb-bar-info">
            <div className="mb-bar-label">선택</div>
            <div className="mb-bar-value">
              {step === 1
                ? date
                  ? formatCompact(date)
                  : '날짜 미선택'
                : time
                  ? `${formatCompact(date)} ${time}`
                  : '시간 미선택'}
            </div>
          </div>

          <button
            type="button"
            className="mb-bar-btn"
            disabled={step === 1 ? !date : !time}
            onClick={() => onStep(step + 1)}
          >
            {step === 1 ? '시간 선택' : '정보 입력'}
          </button>
        </div>
      )}
    </div>
  );
}
