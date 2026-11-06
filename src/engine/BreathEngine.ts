import type { BreathingSettings, Phase, RoundResult } from '../types';

/** Hur stor del av ett andetag som är inandning. */
const INHALE_FRACTION = 0.5;
/** Nedräkning innan första rundan. */
const GET_READY_MS = 3000;
/** Paus mellan rundor (man släpper ut återhämtningsandetaget). */
const BETWEEN_ROUNDS_MS = 4000;
/** Hur lång tid inandningen i återhämtningen tar innan man håller andan. */
const RECOVERY_INHALE_MS = 2500;
/** Tick-intervall för logiken (animationen har sin egen rAF-loop). */
const TICK_MS = 30;

export interface EngineSnapshot {
  phase: Phase;
  /** 1-baserad. */
  round: number;
  totalRounds: number;
  /** 1-baserad, aktuellt andetag i rundan. */
  breath: number;
  breathsPerRound: number;
  inhaling: boolean;
  /** performance.now() när aktuell fas startade. */
  phaseStartedAt: number;
  /** Total längd på fasen i ms (om den har en fast längd). */
  phaseDurationMs: number | null;
  results: RoundResult[];
}

export type EngineCue =
  | { type: 'inhale'; durationSec: number }
  | { type: 'exhale'; durationSec: number }
  | { type: 'getReady'; first: boolean }
  | { type: 'roundStart'; round: number }
  | { type: 'retentionStart' }
  | { type: 'recoveryStart' }
  | { type: 'recoveryRelease' }
  | { type: 'finished' };

export interface EngineCallbacks {
  onChange: (snapshot: EngineSnapshot) => void;
  onCue: (cue: EngineCue) => void;
}

const easeInOut = (x: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, x)))) / 2;

/**
 * Tidsstyrd tillståndsmaskin för ett Wim Hof-pass:
 * getReady → breathing → retention → recovery → (getReady → ...) → finished
 *
 * Helt fri från React så att den är lätt att testa och återanvända.
 */
export class BreathEngine {
  private settings: BreathingSettings;
  private cb: EngineCallbacks;
  private timer: ReturnType<typeof setInterval> | null = null;
  private snap: EngineSnapshot;
  /** Index för senaste halv-andetag vi skickat cue för (breath*2 + 0/1). */
  private lastHalf = -1;
  private recoveryReleased = false;
  /** Orb-nivå vid start av getReady (för mjuk övergång från återhämtning). */
  private getReadyFromLevel = 0;

  constructor(settings: BreathingSettings, callbacks: EngineCallbacks) {
    this.settings = settings;
    this.cb = callbacks;
    this.snap = {
      phase: 'idle',
      round: 1,
      totalRounds: settings.rounds,
      breath: 0,
      breathsPerRound: settings.breathsPerRound,
      inhaling: false,
      phaseStartedAt: performance.now(),
      phaseDurationMs: null,
      results: [],
    };
  }

  get snapshot(): EngineSnapshot {
    return this.snap;
  }

  private get breathMs() {
    return this.settings.secondsPerBreath * 1000;
  }

  start() {
    this.enterGetReady(true);
    this.timer = setInterval(() => this.tick(performance.now()), TICK_MS);
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Användaren behöver andas – avsluta andhållningen. */
  endRetention() {
    if (this.snap.phase !== 'retention') return;
    const now = performance.now();
    const result: RoundResult = {
      round: this.snap.round,
      breaths: this.snap.breath,
      retentionMs: Math.round(now - this.snap.phaseStartedAt),
    };
    this.update({ results: [...this.snap.results, result] });
    this.enterRecovery(now);
  }

  /** Hoppa direkt till andhållningen (t.ex. om man tappat räkningen). */
  skipToRetention() {
    if (this.snap.phase !== 'breathing') return;
    this.enterRetention(performance.now());
  }

  /** Avsluta passet i förtid. Behåller de rundor som är klara. */
  finish() {
    if (this.snap.phase === 'finished') return;
    this.destroy();
    this.update({
      phase: 'finished',
      phaseStartedAt: performance.now(),
      phaseDurationMs: null,
      inhaling: false,
    });
    this.cb.onCue({ type: 'finished' });
  }

  /**
   * Orb-nivå 0..1 vid en viss tidpunkt – används av animationen varje frame
   * så att rörelsen blir mjuk oberoende av tick-intervallet.
   */
  getLevel(now: number): number {
    const { phase, phaseStartedAt } = this.snap;
    const t = now - phaseStartedAt;
    switch (phase) {
      case 'getReady': {
        const d = this.snap.phaseDurationMs ?? GET_READY_MS;
        return this.getReadyFromLevel * (1 - easeInOut(t / (d * 0.8)));
      }
      case 'breathing': {
        const within = (t % this.breathMs) / this.breathMs;
        if (within < INHALE_FRACTION) return easeInOut(within / INHALE_FRACTION);
        return 1 - easeInOut((within - INHALE_FRACTION) / (1 - INHALE_FRACTION));
      }
      case 'retention':
        // Lite större än helt tom, så att timern får plats i orben.
        return 0.12;
      case 'recovery':
        if (t < RECOVERY_INHALE_MS) return easeInOut(t / RECOVERY_INHALE_MS);
        return 1;
      default:
        return 0;
    }
  }

  private update(patch: Partial<EngineSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.cb.onChange(this.snap);
  }

  private enterGetReady(first: boolean) {
    const duration = first ? GET_READY_MS : BETWEEN_ROUNDS_MS;
    this.getReadyFromLevel = first ? 0 : 1;
    this.lastHalf = -1;
    this.update({
      phase: 'getReady',
      breath: 0,
      inhaling: false,
      phaseStartedAt: performance.now(),
      phaseDurationMs: duration,
    });
    this.cb.onCue({ type: 'getReady', first });
  }

  private enterBreathing(now: number) {
    this.lastHalf = -1;
    this.update({
      phase: 'breathing',
      breath: 1,
      inhaling: true,
      phaseStartedAt: now,
      phaseDurationMs: this.breathMs * this.settings.breathsPerRound,
    });
    this.cb.onCue({ type: 'roundStart', round: this.snap.round });
  }

  private enterRetention(now: number) {
    this.update({
      phase: 'retention',
      inhaling: false,
      phaseStartedAt: now,
      phaseDurationMs: null,
    });
    this.cb.onCue({ type: 'retentionStart' });
  }

  private enterRecovery(now: number) {
    this.recoveryReleased = false;
    this.update({
      phase: 'recovery',
      inhaling: true,
      phaseStartedAt: now,
      phaseDurationMs: RECOVERY_INHALE_MS + this.settings.recoveryHoldSeconds * 1000,
    });
    this.cb.onCue({ type: 'recoveryStart' });
    this.cb.onCue({ type: 'inhale', durationSec: RECOVERY_INHALE_MS / 1000 });
  }

  private tick(now: number) {
    const { phase, phaseStartedAt, phaseDurationMs } = this.snap;
    const t = now - phaseStartedAt;

    switch (phase) {
      case 'getReady':
        if (phaseDurationMs !== null && t >= phaseDurationMs) this.enterBreathing(now);
        break;

      case 'breathing': {
        if (phaseDurationMs !== null && t >= phaseDurationMs) {
          this.enterRetention(now);
          break;
        }
        const breathIndex = Math.floor(t / this.breathMs);
        const within = (t % this.breathMs) / this.breathMs;
        const inhaling = within < INHALE_FRACTION;
        const half = breathIndex * 2 + (inhaling ? 0 : 1);
        if (half !== this.lastHalf) {
          this.lastHalf = half;
          const sec = this.breathMs / 1000;
          this.cb.onCue(
            inhaling
              ? { type: 'inhale', durationSec: sec * INHALE_FRACTION }
              : { type: 'exhale', durationSec: sec * (1 - INHALE_FRACTION) },
          );
          this.update({ breath: breathIndex + 1, inhaling });
        }
        break;
      }

      case 'recovery': {
        if (!this.recoveryReleased && phaseDurationMs !== null && t >= phaseDurationMs) {
          this.recoveryReleased = true;
          this.cb.onCue({ type: 'recoveryRelease' });
          this.cb.onCue({ type: 'exhale', durationSec: 3 });
          if (this.snap.round >= this.settings.rounds) {
            this.finish();
          } else {
            this.update({ round: this.snap.round + 1 });
            this.enterGetReady(false);
          }
        }
        break;
      }

      default:
        break;
    }
  }
}
