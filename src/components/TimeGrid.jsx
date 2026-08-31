const DEFAULT_CAPACITY = 3;

const STATUS_LABEL = {
  booked: '마감',
  closed: '운영 안 함',
  expired: '지난 시간',
};

function nonNegativeInteger(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isInteger(number) && number >= 0
    ? number
    : null;
}

function capacityOf(slot) {
  const capacity = nonNegativeInteger(slot?.capacity);

  return capacity && capacity > 0
    ? capacity
    : DEFAULT_CAPACITY;
}

function remainingOf(slot, capacity) {
  const bookedCount = nonNegativeInteger(slot?.bookedCount);

  if (bookedCount !== null) {
    return Math.max(0, Math.min(capacity, capacity - bookedCount));
  }

  const remaining = nonNegativeInteger(slot?.remaining);

  if (remaining !== null) {
    return Math.max(0, Math.min(capacity, remaining));
  }

  if (slot?.status === 'booked') {
    return 0;
  }

  return capacity;
}

export default function TimeGrid({
  times,
  row,
  selected,
  onSelect,
  columns = 2,
}) {
  return (
    <div
      className="tg"
      style={{ '--tg-cols': columns }}
      role="group"
      aria-label="시간 선택"
    >
      {times.map((time) => {
        const slot = row[time];
        const capacity = capacityOf(slot);
        const remaining = remainingOf(slot, capacity);

        const open =
          slot?.status === 'available' &&
          remaining > 0;

        const picked =
          open &&
          selected === time;

        const state = slot
          ? slot.status === 'available' && remaining === 0
            ? '마감'
            : STATUS_LABEL[slot.status] || '마감'
          : '운영 안 함';

        const content = (
          <>
            <span className="tg-copy">
              <span className="tg-time">{time}</span>

              {!open && (
                <span className="tg-state">
                  {state}
                </span>
              )}
            </span>

            <span className="tg-remaining" aria-hidden="true">
              <span
                className={
                  open
                    ? 'tg-remaining-count is-accent'
                    : 'tg-remaining-count'
                }
              >
                {remaining}
              </span>

              <span className="tg-remaining-total">
                /{capacity}명
              </span>
            </span>
          </>
        );

        if (!open) {
          return (
            <span
              key={time}
              className="tg-btn is-off"
              aria-disabled="true"
              aria-label={`${time}, ${state}, 잔여 ${remaining}/${capacity}명`}
            >
              {content}
            </span>
          );
        }

        return (
          <button
            key={time}
            type="button"
            className={
              picked
                ? 'tg-btn is-open is-picked'
                : 'tg-btn is-open'
            }
            aria-pressed={picked}
            aria-label={`${time}, 예약 가능, 잔여 ${remaining}/${capacity}명`}
            onClick={() => onSelect(time)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}