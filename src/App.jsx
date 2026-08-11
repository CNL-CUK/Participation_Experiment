import { useState, useMemo, useEffect } from 'react';
import { useSlots } from './hooks/useSlots';
import { useIsMobile } from './hooks/useIsMobile';
import SiteHeader from './components/SiteHeader';
import DesktopBooking from './components/DesktopBooking';
import MobileBooking from './components/MobileBooking';
import CancelPanel from './components/CancelPanel';
import DoneScreen from './components/DoneScreen';
import { CONFIG } from './config';
import {
  openDates,
  openRangeLabel,
  openRangeShort,
  monthOf,
  todayKey,
} from './utils/date';

export default function App() {
  const { times, byDate, dates, loading, error, reload } = useSlots();
  const isMobile = useIsMobile();

  const [view, setView] = useState('book');
  const [date, setDate] = useState(null);
  const [time, setTime] = useState(null);
  const [step, setStep] = useState(1);
  const [month, setMonth] = useState(null);
  const [done, setDone] = useState(null);

  const available = useMemo(
    () => openDates(dates, byDate, times),
    [dates, byDate, times]
  );

  const visibleDates = useMemo(() => {
    const today = todayKey();
    return dates.filter((slotDate) => slotDate >= today);
  }, [dates]);

  const visibleAvailable = useMemo(() => {
    const visibleSet = new Set(visibleDates);
    return available.filter((d) => visibleSet.has(d));
  }, [available, visibleDates]);

  const dateSet = useMemo(() => new Set(visibleDates), [visibleDates]);

  const availableSet = useMemo(() => new Set(visibleAvailable), [visibleAvailable]);

  const months = useMemo(
    () => Array.from(new Set(visibleDates.map(monthOf))).sort(),
    [visibleDates]
  );

  useEffect(() => {
    if (months.length === 0) {
      if (month) setMonth(null);
      return;
    }

    if (!month || !months.includes(month)) {
      setMonth(months[0]);
    }
  }, [months, month]);

  useEffect(() => {
    if (date && !dateSet.has(date)) {
      setDate(null);
      setTime(null);
      setStep(1);
      return;
    }

    if (date && time && byDate[date]?.[time]?.status !== 'available') {
      setTime(null);
      if (isMobile) setStep(2);
    }
  }, [byDate, date, dateSet, isMobile, time]);

  function resetAll() {
    setDone(null);
    setDate(null);
    setTime(null);
    setStep(1);
    setView('book');
  }

  function pickDate(nextDate) {
    setDate(nextDate);
    setTime(null);

    if (isMobile) {
      setStep(nextDate ? 2 : 1);
    }
  }

  function pickTime(nextTime) {
    setTime(nextTime);
  }

  if (loading) {
    return <p className="state">예약 가능 시간을 불러오는 중…</p>;
  }

  if (error) {
    return (
      <div className="state">
        <p>예약 정보를 불러오지 못했습니다.</p>
        <button type="button" className="state-btn" onClick={reload}>
          다시 시도
        </button>
        <p className="state-sub">문제가 계속되면 {CONFIG.contact}로 연락해 주세요.</p>
      </div>
    );
  }

  if (done) {
    return <DoneScreen info={done} onRestart={resetAll} />;
  }

  const rangeLabel = isMobile
    ? openRangeShort(visibleAvailable)
    : openRangeLabel(visibleAvailable);

  return (
    <div className={isMobile ? 'page is-mobile' : 'page is-desktop'}>
      <SiteHeader
        mobile={isMobile}
        openRange={rangeLabel}
        onGoBook={() => setView('book')}
        onGoCancel={() => setView('cancel')}
      />

      <main className="main">
        {view === 'cancel' ? (
          <CancelPanel onCancelled={reload} onBack={() => setView('book')} />
        ) : visibleDates.length === 0 ? (
          <div className="state">
            <p>현재 예약 가능한 시간이 없습니다.</p>
            <p className="state-sub">
              모집이 마감되었거나 아직 일정이 열리지 않았습니다. {CONFIG.contact}로
              문의해 주세요.
            </p>
          </div>
        ) : isMobile ? (
          <MobileBooking
            times={times}
            byDate={byDate}
            dates={visibleDates}
            step={step}
            date={date}
            time={time}
            onStep={setStep}
            onPickDate={pickDate}
            onPickTime={pickTime}
            onSuccess={(info) => {
              setDone(info);
              reload();
            }}
            onConflict={() => {
              reload();
              setTime(null);
              setStep(2);
            }}
          />
        ) : (
          <DesktopBooking
            times={times}
            byDate={byDate}
            month={month || months[0]}
            months={months}
            dateSet={dateSet}
            availableSet={availableSet}
            date={date}
            time={time}
            onMonthChange={setMonth}
            onPickDate={pickDate}
            onPickTime={pickTime}
            onSuccess={(info) => {
              setDone(info);
              reload();
            }}
            onConflict={() => {
              reload();
              setTime(null);
            }}
          />
        )}
      </main>
    </div>
  );
}
