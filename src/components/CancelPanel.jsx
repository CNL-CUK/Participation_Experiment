import { useState } from 'react';
import { lookupReservations, cancelSlot, messageOf } from '../api/reservation';
import { CONFIG, cancelNoteText } from '../config';
import { formatDate } from '../utils/date';

export default function CancelPanel({ onCancelled, onBack }) {
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('error');
  const [confirming, setConfirming] = useState(null);
  const idLen = CONFIG.studentIdLength;

  function updateCredentials(setter, value) {
    setter(value);
    setList(null);
    setMessage('');
    setConfirming(null);
  }

  async function search(event) {
    event.preventDefault();
    const normalizedName = name.trim();

    if (!normalizedName || !new RegExp(`^\\d{${idLen}}$`).test(studentId)) {
      setMessageTone('error');
      setMessage(`이름과 학번 ${idLen}자리를 정확히 입력해 주세요.`);
      return;
    }

    setBusy(true);
    setMessage('');
    setList(null);

    try {
      const response = await lookupReservations({ name: normalizedName, studentId });
      if (response.ok) {
        setList(Array.isArray(response.reservations) ? response.reservations : []);
      } else {
        setMessageTone('error');
        setMessage(messageOf(response.reason));
      }
    } catch (error) {
      setMessageTone('error');
      setMessage(messageOf(error.message));
    } finally {
      setBusy(false);
    }
  }

  async function doCancel(reservation) {
    setBusy(true);
    setMessage('');

    try {
      const response = await cancelSlot({
        slotId: reservation.slotId,
        name: name.trim(),
        studentId,
      });

      if (response.ok) {
        setList((current) => current.filter((item) => item.slotId !== reservation.slotId));
        setMessageTone('ok');
        setMessage('예약이 취소되었습니다.');
        onCancelled?.();
      } else {
        setMessageTone('error');
        setMessage(messageOf(response.reason));
      }
    } catch (error) {
      setMessageTone('error');
      setMessage(messageOf(error.message));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <div className="cp">
      <div className="cp-card">
        <button type="button" className="cp-back" onClick={onBack}>
          ‹ 예약하기로 돌아가기
        </button>

        <h2 className="cp-title">예약 확인 · 취소</h2>
        <p className="cp-guide">예약할 때 입력한 이름과 학번으로 조회할 수 있습니다.</p>

        <form onSubmit={search} noValidate>
          <div className="pf-field">
            <label className="pf-label" htmlFor="cp-name">이름</label>
            <input
              id="cp-name"
              name="name"
              className="pf-input"
              value={name}
              disabled={busy}
              maxLength={50}
              autoComplete="name"
              onChange={(event) => updateCredentials(setName, event.target.value)}
            />
          </div>

          <div className="pf-field">
            <label className="pf-label" htmlFor="cp-sid">학번</label>
            <input
              id="cp-sid"
              name="studentId"
              className="pf-input"
              value={studentId}
              disabled={busy}
              inputMode="numeric"
              maxLength={idLen}
              placeholder={`숫자 ${idLen}자리`}
              autoComplete="off"
              onChange={(event) =>
                updateCredentials(setStudentId, event.target.value.replace(/\D/g, ''))
              }
            />
          </div>

          <button type="submit" className="pf-submit" disabled={busy}>
            {busy ? '조회 중…' : '예약 조회'}
          </button>
        </form>

        {message && (
          <p
            className={messageTone === 'ok' ? 'cp-msg is-ok' : 'cp-msg is-error'}
            role="alert"
          >
            {message}
          </p>
        )}

        {list?.length === 0 && <p className="cp-empty">조회된 예약이 없습니다.</p>}

        {list?.length > 0 && (
          <ul className="cp-list">
            {list.map((reservation) => (
              <li className="cp-item" key={reservation.slotId}>
                <span className="cp-item-when">
                  {formatDate(reservation.date)} {reservation.time}
                </span>
                {confirming === reservation.slotId ? (
                  <span className="cp-confirm">
                    <button
                      type="button"
                      className="cp-btn is-danger"
                      disabled={busy}
                      onClick={() => doCancel(reservation)}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      className="cp-btn"
                      disabled={busy}
                      onClick={() => setConfirming(null)}
                    >
                      뒤로
                    </button>
                  </span>
                ) : reservation.cancelable ? (
                  <button
                    type="button"
                    className="cp-btn"
                    disabled={busy}
                    onClick={() => setConfirming(reservation.slotId)}
                  >
                    예약 취소
                  </button>
                ) : (
                  <span className="cp-off">전화 문의</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="cp-note">{cancelNoteText()}</p>
      </div>
    </div>
  );
}
