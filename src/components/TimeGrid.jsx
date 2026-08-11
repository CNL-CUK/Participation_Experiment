const STATUS_LABEL = {
  booked: '마감',
  closed: '운영 안 함',
  expired: '지난 시간',
};

export default function TimeGrid({ times, row, selected, onSelect, columns = 2 }) {
  return (
    <div
      className="tg"
      style={{ '--tg-cols': columns }}
      role="group"
      aria-label="시간 선택"
    >
      {times.map((t) => {
        const slot = row[t];
        const open = slot && slot.status === 'available';
        const state = slot ? STATUS_LABEL[slot.status] || '마감' : '운영 안 함';
        const picked = open && selected === t;

        if (!open) {
          return (
            <span key={t} className="tg-btn is-off" aria-disabled="true">
              <span className="tg-time">{t}</span>
              <span className="tg-state">{state}</span>
            </span>
          );
        }

        return (
          <button
            key={t}
            type="button"
            className={picked ? 'tg-btn is-open is-picked' : 'tg-btn is-open'}
            aria-pressed={picked}
            aria-label={`${t} 예약 가능`}
            onClick={() => onSelect(t)}
          >
            <span className="tg-time">{t}</span>
          </button>
        );
      })}
    </div>
  );
}
