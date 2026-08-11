import MonthCalendar from './MonthCalendar';
import TimeGrid from './TimeGrid';
import ParticipantForm from './ParticipantForm';
import { formatDate } from '../utils/date';

export default function DesktopBooking({
  times,
  byDate,
  month,
  months,
  dateSet,
  availableSet,
  date,
  time,
  onMonthChange,
  onPickDate,
  onPickTime,
  onSuccess,
  onConflict,
}) {
  const row = date ? byDate[date] || {} : {};
  const selectedSlot = date && time ? row[time] : null;
  const slot = selectedSlot?.status === 'available' ? selectedSlot : null;

  return (
    <div className="dk">
      <MonthCalendar
        month={month}
        months={months}
        onMonthChange={onMonthChange}
        dateSet={dateSet}
        availableSet={availableSet}
        selected={date}
        onSelect={onPickDate}
      />

      <aside className="dk-panel">
        {date ? (
          <div className="dk-card">
            <h2 className="dk-date">{formatDate(date)}</h2>
            <TimeGrid times={times} row={row} selected={time} onSelect={onPickTime} />
            <div className="dk-divider" />
            <ParticipantForm slot={slot} onSuccess={onSuccess} onConflict={onConflict} />
          </div>
        ) : (
          <div className="dk-empty">
            <p className="dk-empty-title">날짜를 먼저 선택해 주세요</p>
            <p className="dk-empty-body">
              선택하면 예약 가능한 시간과
              <br />
              참가자 정보 입력 칸이 나타납니다.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
