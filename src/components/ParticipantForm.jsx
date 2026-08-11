import { useRef, useState } from 'react';
import { CONFIG } from '../config';
import { bookSlot, messageOf } from '../api/reservation';

const EMPTY = { name: '', studentId: '', phone: '', course: '', courseProf: '' };
const TEXT_LIMIT = { name: 50, course: 100, courseProf: 50 };
const UNSAFE_PREFIX = /^[=+\-@]/;

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function ParticipantForm({ slot, onSuccess, onConflict, compact }) {
  const [form, setForm] = useState(EMPTY);
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const idLen = CONFIG.studentIdLength;

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
    setServerError('');
  }

  function validate() {
    const nextErrors = {};
    const name = form.name.trim();

    if (!name) nextErrors.name = '이름을 입력해 주세요';
    else if (name.length > TEXT_LIMIT.name || UNSAFE_PREFIX.test(name)) {
      nextErrors.name = '이름을 다시 확인해 주세요';
    }

    if (!new RegExp(`^\\d{${idLen}}$`).test(form.studentId.trim())) {
      nextErrors.studentId = `학번 ${idLen}자리를 정확히 입력해 주세요`;
    }
    if (!/^01[016789]-\d{4}-\d{4}$/.test(form.phone.trim())) {
      nextErrors.phone = '010-1234-5678 형식으로 입력해 주세요';
    }

    for (const key of ['course', 'courseProf']) {
      const value = form[key].trim();
      if (value && (value.length > TEXT_LIMIT[key] || UNSAFE_PREFIX.test(value))) {
        nextErrors[key] = '입력 내용을 다시 확인해 주세요';
      }
    }

    if (!agreed) nextErrors.agreed = '개인정보 수집에 동의해 주세요';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    if (!slot || submittingRef.current || !validate()) return;

    submittingRef.current = true;
    setSubmitting(true);
    setServerError('');

    const payload = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value.trim()])
    );

    try {
      const response = await bookSlot({ slotId: slot.slotId, ...payload });
      if (response.ok) {
        onSuccess({ slot, name: payload.name });
      } else {
        setServerError(messageOf(response.reason));
        if (response.reason === 'already_booked' || response.reason === 'expired') {
          onConflict();
        }
      }
    } catch (error) {
      setServerError(messageOf(error.message));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function field(key, label, options = {}) {
    const id = `pf-${key}`;
    const invalid = Boolean(errors[key]);

    return (
      <div className="pf-field" key={key}>
        <label className="pf-label" htmlFor={id}>
          {label}
          {options.required ? (
            <span className="pf-req" aria-hidden="true"> *</span>
          ) : (
            <span className="pf-opt"> (선택)</span>
          )}
        </label>
        <input
          id={id}
          name={options.name || key}
          className={invalid ? 'pf-input is-invalid' : 'pf-input'}
          value={form[key]}
          placeholder={options.placeholder || ''}
          disabled={submitting}
          maxLength={options.maxLength}
          inputMode={options.inputMode}
          autoComplete={options.autoComplete}
          aria-required={options.required || undefined}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-err` : undefined}
          onChange={(event) => {
            const rawValue = event.target.value;
            const nextValue = options.format
              ? options.format(rawValue)
              : options.digitsOnly
                ? rawValue.replace(/\D/g, '')
                : rawValue;
            set(key, nextValue);
          }}
        />
        {invalid && <p className="pf-err" id={`${id}-err`}>{errors[key]}</p>}
      </div>
    );
  }

  const buttonLabel = submitting
    ? '예약 처리 중…'
    : slot
      ? `${slot.time} 예약 확정`
      : '시간을 선택해 주세요';

  return (
    <form className={compact ? 'pf pf-compact' : 'pf'} onSubmit={submit} noValidate>
      <h3 className="pf-heading">참가자 정보</h3>

      <div className="pf-row">
        {field('name', '이름', {
          required: true,
          maxLength: TEXT_LIMIT.name,
          autoComplete: 'name',
        })}
        {field('studentId', '학번', {
          required: true,
          digitsOnly: true,
          inputMode: 'numeric',
          maxLength: idLen,
          placeholder: `숫자 ${idLen}자리`,
          autoComplete: 'off',
        })}
      </div>

      {field('phone', '연락처', {
        required: true,
        inputMode: 'tel',
        maxLength: 13,
        placeholder: '010-1234-5678',
        format: formatPhone,
        autoComplete: 'tel',
      })}

      {CONFIG.showCourseFields && (
        <div className="pf-row">
          {field('course', '강의명', { maxLength: TEXT_LIMIT.course })}
          {field('courseProf', '담당 교수', { maxLength: TEXT_LIMIT.courseProf })}
        </div>
      )}

      <div className="pf-agree">
        <input
          type="checkbox"
          id="pf-agree"
          className="pf-check"
          checked={agreed}
          disabled={submitting}
          aria-describedby={errors.agreed ? 'pf-agree-err' : undefined}
          onChange={(event) => {
            setAgreed(event.target.checked);
            setErrors((current) => ({ ...current, agreed: '' }));
          }}
        />
        <label htmlFor="pf-agree" className="pf-agree-text">
          개인정보 수집·이용에 동의합니다. 이름·학번·연락처를 수집하며 실험 종료 후 즉시
          폐기합니다.
        </label>
      </div>
      {errors.agreed && <p className="pf-err" id="pf-agree-err">{errors.agreed}</p>}

      {serverError && <p className="pf-server-err" role="alert">{serverError}</p>}

      <button type="submit" className="pf-submit" disabled={!slot || submitting}>
        {buttonLabel}
      </button>

      {submitting && <p className="pf-hint" role="status">잠시만 기다려 주세요. 창을 닫지 마세요.</p>}
    </form>
  );
}
