import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audio } from './audio/AudioEngine';
import { BreathOrb, type OrbState } from './components/BreathOrb';
import { HistoryView } from './components/HistoryView';
import { SessionView } from './components/SessionView';
import { SettingsPanel } from './components/SettingsPanel';
import { SummaryView } from './components/SummaryView';
import { formatDuration, newId } from './format';
import { useBreathingSession } from './hooks/useBreathingSession';
import { useWakeLock } from './hooks/useWakeLock';
import { sessionRepository } from './storage';
import { loadSettings, saveSettings } from './storage/settings';
import type { BreathingSession, BreathingSettings } from './types';

type Screen = 'home' | 'session' | 'summary' | 'history';

/** Grov uppskattning av passets längd (andhållningen gissas till ~1,5 min). */
function estimateMinutes(s: BreathingSettings) {
  const perRound = 3 + s.breathsPerRound * s.secondsPerBreath + 90 + 2.5 + s.recoveryHoldSeconds + 4;
  return Math.max(1, Math.round((perRound * s.rounds) / 60));
}

const bestOf = (sessions: BreathingSession[]) => {
  const all = sessions.flatMap((s) => s.rounds.map((r) => r.retentionMs));
  return all.length ? Math.max(...all) : null;
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [settings, setSettings] = useState<BreathingSettings>(loadSettings);
  const [sessions, setSessions] = useState<BreathingSession[]>([]);
  const [lastSession, setLastSession] = useState<BreathingSession | null>(null);
  const [previousBest, setPreviousBest] = useState<number | null>(null);
  const { engineRef, snapshot, startedAtRef, start, endRetention, skipToRetention, finish, reset } =
    useBreathingSession();
  const savedRef = useRef(false);

  useWakeLock(screen === 'session');

  useEffect(() => {
    sessionRepository.list().then(setSessions);
  }, []);

  const updateSettings = (next: BreathingSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const best = useMemo(() => bestOf(sessions), [sessions]);

  const handleStart = async () => {
    savedRef.current = false;
    setPreviousBest(best);
    setScreen('session');
    await start(settings);
  };

  // När passet är klart: spara och visa sammanfattning.
  useEffect(() => {
    if (snapshot?.phase !== 'finished' || savedRef.current) return;
    savedRef.current = true;
    const session: BreathingSession = {
      id: newId(),
      startedAt: (startedAtRef.current ?? new Date()).toISOString(),
      endedAt: new Date().toISOString(),
      settings: {
        breathsPerRound: settings.breathsPerRound,
        secondsPerBreath: settings.secondsPerBreath,
        rounds: settings.rounds,
        recoveryHoldSeconds: settings.recoveryHoldSeconds,
      },
      rounds: snapshot.results,
    };
    setLastSession(session);
    if (session.rounds.length > 0) {
      sessionRepository
        .save(session)
        .then(() => sessionRepository.list())
        .then(setSessions);
      setScreen('summary');
    } else {
      // Avbrutet innan första andhållningen – inget att spara.
      reset();
      audio.suspend();
      setScreen('home');
    }
  }, [snapshot, settings, startedAtRef, reset]);

  const goHome = () => {
    reset();
    audio.suspend();
    setScreen('home');
  };

  const getOrbState = useCallback(
    (now: number): OrbState => {
      const engine = engineRef.current;
      if (screen === 'session' && engine) {
        return { level: engine.getLevel(now), phase: engine.snapshot.phase };
      }
      // Lugn "viloandning" när inget pass pågår.
      const level = 0.35 + 0.22 * Math.sin((now / 1000) * ((Math.PI * 2) / 8));
      return { level, phase: screen === 'summary' ? 'finished' : 'idle' };
    },
    [screen, engineRef],
  );

  return (
    <div className="app" data-screen={screen}>
      <div className="bg" aria-hidden="true" />
      <BreathOrb getState={getOrbState} />

      {screen === 'home' && (
        <main className="home">
          <header className="home-hero">
            <h1 className="title">Andas</h1>
            <p className="subtitle">Wim Hof-andning</p>
          </header>

          <section className="panel">
            <SettingsPanel settings={settings} onChange={updateSettings} />

            <button type="button" className="btn primary big full" onClick={handleStart}>
              Starta
            </button>
            <p className="estimate">
              {settings.rounds} {settings.rounds === 1 ? 'runda' : 'rundor'} · ca {estimateMinutes(settings)} min
            </p>
          </section>

          <button type="button" className="history-link" onClick={() => setScreen('history')}>
            <span>Historik</span>
            {best !== null && <span className="muted">Rekord {formatDuration(best)}</span>}
          </button>

          <p className="safety">
            Gör aldrig övningen i vatten, när du kör eller står upp. Lyssna på kroppen.
          </p>
        </main>
      )}

      {screen === 'session' && snapshot && (
        <SessionView
          snapshot={snapshot}
          bestRetentionMs={previousBest}
          onEndRetention={endRetention}
          onSkipToRetention={skipToRetention}
          onFinish={finish}
        />
      )}

      {screen === 'summary' && lastSession && (
        <main className="centered">
          <SummaryView session={lastSession} previousBestMs={previousBest} onAgain={handleStart} onHome={goHome} />
        </main>
      )}

      {screen === 'history' && (
        <main className="centered">
          <HistoryView
            sessions={sessions}
            onBack={() => setScreen('home')}
            onDelete={async (id) => {
              await sessionRepository.remove(id);
              setSessions(await sessionRepository.list());
            }}
            onClear={async () => {
              await sessionRepository.clear();
              setSessions([]);
            }}
          />
        </main>
      )}
    </div>
  );
}
