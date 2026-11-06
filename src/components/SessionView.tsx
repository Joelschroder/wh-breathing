import { useEffect, useState } from 'react';
import { audio } from '../audio/AudioEngine';
import type { EngineSnapshot } from '../engine/BreathEngine';
import { formatDuration } from '../format';
import { useNow } from '../hooks/useNow';

interface Props {
  snapshot: EngineSnapshot;
  bestRetentionMs: number | null;
  onEndRetention: () => void;
  onSkipToRetention: () => void;
  onFinish: () => void;
}

export function SessionView({ snapshot, bestRetentionMs, onEndRetention, onSkipToRetention, onFinish }: Props) {
  const now = useNow();
  const [muted, setMuted] = useState(false);
  const { phase, round, totalRounds, breath, breathsPerRound, inhaling, phaseStartedAt, phaseDurationMs } = snapshot;
  const elapsed = now - phaseStartedAt;
  const remaining = phaseDurationMs !== null ? Math.max(0, phaseDurationMs - elapsed) : 0;

  // Tangentbord: mellanslag = andas igen, Escape = avsluta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (phase === 'retention') onEndRetention();
      } else if (e.code === 'Escape') {
        onFinish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onEndRetention, onFinish]);

  const toggleMute = () => {
    setMuted((m) => {
      audio.setMuted(!m);
      return !m;
    });
  };

  let center: React.ReactNode = null;
  let title = '';
  let hint = '';

  switch (phase) {
    case 'getReady': {
      const secs = Math.ceil(remaining / 1000);
      center = <span className="center-number">{secs}</span>;
      if (round === 1) {
        title = 'Gör dig redo';
        hint = 'Sitt eller ligg bekvämt. Andas genom näsan eller munnen.';
      } else {
        title = elapsed < 2000 ? 'Släpp ut' : `Runda ${round}`;
        hint = 'Slappna av – nästa runda börjar strax.';
      }
      break;
    }
    case 'breathing': {
      center = <span className="center-number">{breath}</span>;
      const last = breath === breathsPerRound;
      if (last) {
        title = inhaling ? 'Sista – andas in fullt' : 'Släpp ut… och håll';
      } else {
        title = inhaling ? 'Andas in' : 'Släpp ut';
      }
      hint = 'Djupa andetag in, slappna av ut.';
      break;
    }
    case 'retention': {
      center = <span className="center-number timer">{formatDuration(elapsed)}</span>;
      title = 'Håll andan';
      hint = 'Tryck när du behöver andas';
      break;
    }
    case 'recovery': {
      const inhalePhase = phaseDurationMs !== null && remaining > phaseDurationMs - 2500;
      center = <span className="center-number">{Math.ceil(remaining / 1000)}</span>;
      title = inhalePhase ? 'Andas in djupt' : 'Håll';
      hint = 'Återhämtningsandetag – håll andan med fulla lungor.';
      break;
    }
    default:
      break;
  }

  const progress =
    phase === 'breathing'
      ? Math.min(1, elapsed / (phaseDurationMs ?? 1))
      : phase === 'recovery' && phaseDurationMs
        ? Math.min(1, elapsed / phaseDurationMs)
        : phase === 'retention'
          ? 1
          : 0;

  return (
    <div className={`session phase-${phase}`}>
      <header className="session-top">
        <div className="round-dots" aria-label={`Runda ${round} av ${totalRounds}`}>
          {Array.from({ length: totalRounds }, (_, i) => (
            <span key={i} className={i + 1 < round ? 'done' : i + 1 === round ? 'current' : ''} />
          ))}
          <span className="round-label">
            Runda {round}/{totalRounds}
          </span>
        </div>
        <div className="top-actions">
          <button type="button" className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Slå på ljud' : 'Stäng av ljud'}>
            {muted ? <SpeakerOffIcon /> : <SpeakerIcon />}
          </button>
          <button type="button" className="icon-btn" onClick={onFinish} aria-label="Avsluta passet">
            <CloseIcon />
          </button>
        </div>
      </header>

      <button
        type="button"
        className="orb-hitbox"
        onClick={phase === 'retention' ? onEndRetention : undefined}
        tabIndex={-1}
        aria-hidden="true"
      >
        <span key={`${phase}-${phase === 'breathing' ? breath : ''}`} className="center">
          {center}
        </span>
      </button>

      <footer className="session-bottom">
        <h2 key={title} className="phase-title">
          {title}
        </h2>
        <p className="phase-hint">{hint}</p>

        {phase === 'retention' && bestRetentionMs !== null && (
          <p className="phase-best">
            Ditt rekord: <strong>{formatDuration(bestRetentionMs)}</strong>
          </p>
        )}

        <div className="progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>

        <div className="session-actions">
          {phase === 'breathing' && (
            <button type="button" className="btn ghost" onClick={onSkipToRetention}>
              Hoppa till andhållning
            </button>
          )}
          {phase === 'retention' && (
            <button type="button" className="btn primary big" onClick={onEndRetention}>
              Andas in
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H3v6h3l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);

const SpeakerOffIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H3v6h3l5 4V5z" />
    <path d="m16 9 6 6M22 9l-6 6" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
