import { CONFIG } from '../config';
import { formatDate } from '../utils/date';

export default function DoneScreen({ info, onRestart }) {
  return (
    <div className="done">
      <div className="done-card">
        <div className="done-mark" aria-hidden="true">✓</div>
        <h2 className="done-title">예약이 완료되었습니다</h2>

        <div className="done-when">
          {formatDate(info.slot.date)} {info.slot.time}
        </div>
        <div className="done-where">
          {CONFIG.place} · {info.name}님
        </div>

        <dl className="done-facts">
          <div>
            <dt>소요 시간</dt>
            <dd>{CONFIG.duration}</dd>
          </div>
          <div>
            <dt>도착 시각</dt>
            <dd>{CONFIG.arriveBeforeMinutes}분 전까지</dd>
          </div>
          <div>
            <dt>문의</dt>
            <dd>{CONFIG.contact}</dd>
          </div>
        </dl>

        <p className="done-note">
          취소는 상단 메뉴의 &lsquo;예약 확인 · 취소&rsquo;에서 이름과 학번으로 하실 수
          있습니다. 실험 {CONFIG.cancelDeadlineHours}시간 전까지 가능합니다.
        </p>

        <button type="button" className="done-btn" onClick={onRestart}>
          예약 화면으로 돌아가기
        </button>
      </div>
    </div>
  );
}
