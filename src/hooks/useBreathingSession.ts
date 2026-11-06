import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '../audio/AudioEngine';
import { BreathEngine, type EngineCue, type EngineSnapshot } from '../engine/BreathEngine';
import type { BreathingSettings } from '../types';

function handleCue(cue: EngineCue) {
  switch (cue.type) {
    case 'inhale':
      audio.breathIn(cue.durationSec);
      break;
    case 'exhale':
      audio.breathOut(cue.durationSec);
      break;
    case 'getReady':
      audio.setMood('calm');
      break;
    case 'roundStart':
      audio.setMood('breathing');
      audio.bell(293.66, 0.18);
      break;
    case 'retentionStart':
      audio.breathSilence();
      audio.setMood('retention');
      audio.bell(146.83, 0.4);
      break;
    case 'recoveryStart':
      audio.setMood('recovery');
      audio.bell(220, 0.3);
      break;
    case 'recoveryRelease':
      audio.bell(329.63, 0.18);
      break;
    case 'finished':
      audio.breathSilence();
      audio.setMood('calm');
      audio.bell(146.83, 0.3);
      setTimeout(() => audio.bell(220, 0.25), 700);
      break;
  }
}

/**
 * Kopplar ihop BreathEngine (logik), AudioEngine (ljud) och React-state.
 */
export function useBreathingSession() {
  const engineRef = useRef<BreathEngine | null>(null);
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const startedAtRef = useRef<Date | null>(null);

  const start = useCallback(async (settings: BreathingSettings) => {
    engineRef.current?.destroy();
    // Ljud måste startas i samma klick som användaren gör.
    await audio.init();
    audio.setVolume(settings.volume);
    audio.setBreathSound(settings.breathSound);
    audio.setBackground(settings.backgroundSound);

    const engine = new BreathEngine(settings, {
      onChange: setSnapshot,
      onCue: handleCue,
    });
    engineRef.current = engine;
    startedAtRef.current = new Date();
    engine.start();
  }, []);

  const endRetention = useCallback(() => engineRef.current?.endRetention(), []);
  const skipToRetention = useCallback(() => engineRef.current?.skipToRetention(), []);
  const finish = useCallback(() => engineRef.current?.finish(), []);

  const reset = useCallback(() => {
    engineRef.current?.destroy();
    engineRef.current = null;
    setSnapshot(null);
  }, []);

  useEffect(() => () => engineRef.current?.destroy(), []);

  return { engineRef, snapshot, startedAtRef, start, endRetention, skipToRetention, finish, reset };
}
