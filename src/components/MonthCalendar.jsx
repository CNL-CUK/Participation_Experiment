import {
  DAY_LABEL,
  monthCells,
  formatMonth,
  shiftMonth,
  formatDate,
} from '../utils/date';

export default function MonthCalendar({
  month,
  months,
  onMonthChange,
  dateSet,
  availableSet,
  selected,
  onSelect,
}) {
  const cells = monthCells(month);
  const idx = months.indexOf(month);
  const prev = idx > 0 ? months[idx - 1] : null;
  const next =
    idx >= 0 && idx < months.length - 1
      ? months[idx + 1]
      : null;

  function label(m) {
    return `${Number(m.split('-')[1])}월`;
  }

  return (
    <section className="cal" aria-label="날짜 선택">
      <div className="cal-head">
        <h2 className="cal-month">{formatMonth(month)}</h2>

        <div className="cal-nav">
          <button
            type="button"
            className="cal-nav-btn"
            disabled={!prev}
            onClick={() => prev && onMonthChange(prev)}
          >
            ‹ {prev ? label(prev) : label(shiftMonth(month, -1))}
          </button>

          <span className="cal-nav-dot" aria-hidden="true">·</span>

          <button
            type="button"
            className="cal-nav-btn"
            disabled={!next}
            onClick={() => next && onMonthChange(next)}
          >
            {next ? label(next) : label(shiftMonth(month, 1))} ›
          </button>
        </div>
      </div>

      <div className="cal-dow" aria-hidden="true">
        {DAY_LABEL.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div
        className="cal-grid"
        role="group"
        aria-label={formatMonth(month)}
      >
        {cells.map((cell) => {
          const selectable =
            cell.inMonth && dateSet.has(cell.key);
          const open =
            selectable && availableSet.has(cell.key);
          const isSelected =
            selectable && selected === cell.key;

          if (!selectable) {
            return (
              <div
                key={cell.key}
                className={
                  cell.inMonth
                    ? 'cal-cell is-closed'
                    : 'cal-cell is-outside'
                }
                aria-hidden={!cell.inMonth}
              >
                {cell.dayNumber}
              </div>
            );
          }

          const statusClass = open ? 'is-open' : 'is-full';
          const selectedClass = isSelected ? ' is-picked' : '';

          return (
            <button
              key={cell.key}
              type="button"
              className={`cal-cell is-selectable ${statusClass}${selectedClass}`}
              aria-pressed={isSelected}
              aria-label={`${formatDate(cell.key)} ${
                open ? '예약 가능' : '마감'
              }`}
              onClick={() => onSelect(cell.key)}
            >
              {cell.dayNumber}
              <span className="cal-dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <ul className="cal-legend">
        <li>
          <span
            className="cal-legend-dot is-open"
            aria-hidden="true"
          />
          예약 가능
        </li>
        <li>
          <span
            className="cal-legend-dot is-closed"
            aria-hidden="true"
          />
          마감
        </li>
      </ul>
    </section>
  );
}