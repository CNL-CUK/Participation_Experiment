import { useState, useEffect, useRef } from 'react';
import { CONFIG, noticeText } from '../config';

export default function SiteHeader({
  mobile,
  openRange,
  onGoBook,
  onGoCancel,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;

    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }

    function onKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!mobile || !menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobile, menuOpen]);

  const chips = [
    { label: '장소', value: CONFIG.place },
    { label: '소요 시간', value: CONFIG.duration },
    { label: '예약 가능 날짜', value: openRange, accent: true },
  ];

  const menu = (
    <nav id="site-menu" className="hd-menu" aria-label="사이트 메뉴">
      {mobile && (
        <div className="hd-menu-head">
          <strong>메뉴</strong>
          <button
            type="button"
            className="hd-menu-close"
            aria-label="메뉴 닫기"
            onClick={() => setMenuOpen(false)}
          >
            ✕
          </button>
        </div>
      )}

      <button
        type="button"
        className="hd-menu-item"
        onClick={() => {
          setMenuOpen(false);
          onGoBook();
        }}
      >
        <span>실험 참가 예약</span>
        <span className="hd-menu-arrow" aria-hidden="true">›</span>
      </button>

      <button
        type="button"
        className="hd-menu-item"
        onClick={() => {
          setMenuOpen(false);
          onGoCancel();
        }}
      >
        <span>예약 확인 · 취소</span>
        <span className="hd-menu-arrow" aria-hidden="true">›</span>
      </button>

      <a
        className="hd-menu-item"
        href={CONFIG.labSiteUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>CNL Home</span>
        <span className="hd-menu-arrow" aria-hidden="true">›</span>
      </a>
    </nav>
  );

  return (
    <header className={mobile ? 'hd hd-m' : 'hd hd-d'}>
      <div className="hd-inner" ref={wrapRef}>
        <div className="hd-top">
          <a className="hd-brand" href={CONFIG.labSiteUrl}>
            <span className="hd-name">
              {mobile ? CONFIG.labNameMobile : CONFIG.labNameDesktop}
            </span>
          </a>

          <button
            type="button"
            className="hd-burger"
            aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? (
              <span className="hd-close" aria-hidden="true">✕</span>
            ) : (
              <>
                <span className="hd-bar" aria-hidden="true" />
                <span className="hd-bar" aria-hidden="true" />
                <span className="hd-bar" aria-hidden="true" />
              </>
            )}
          </button>

          {!mobile && menuOpen && menu}
        </div>

        {mobile && menuOpen && (
          <>
            <button
              type="button"
              className="hd-menu-backdrop"
              aria-label="메뉴 닫기"
              onClick={() => setMenuOpen(false)}
            />
            {menu}
          </>
        )}

        <div className="hd-lead">
          <h1 className="hd-title">{CONFIG.title}</h1>

          {mobile ? (
            <p className="hd-sub">
              {CONFIG.duration} 소요
              {CONFIG.reward ? ` · ${CONFIG.reward}` : ''}
            </p>
          ) : (
            <>
              <p className="hd-sub">{noticeText()}</p>
              <p className="hd-sub">문의: {CONFIG.contact}</p>
            </>
          )}
        </div>

        <div className="hd-chips">
          {chips.map((chip) => (
            <div className="hd-chip" key={chip.label}>
              <div className="hd-chip-label">{chip.label}</div>
              <div
                className={
                  chip.accent
                    ? 'hd-chip-value is-accent'
                    : 'hd-chip-value'
                }
              >
                {chip.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
