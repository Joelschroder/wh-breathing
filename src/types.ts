export type BackgroundSound = 'ambient' | 'ocean' | 'none';

export interface BreathingSettings {
  /** Antal andetag per runda. */
  breathsPerRound: number;
  /** Sekunder per hela andetag (in + ut). Lägre = snabbare. */
  secondsPerBreath: number;
  /** Antal rundor i ett pass. */
  rounds: number;
  /** Hur länge man håller andan efter återhämtningsandetaget (sekunder). */
  recoveryHoldSeconds: number;
  /** Bakgrundsljud. */
  backgroundSound: BackgroundSound;
  /** Spela ett mjukt "andningsljud" som följer animationen. */
  breathSound: boolean;
  /** Huvudvolym 0–1. */
  volume: number;
}

export const DEFAULT_SETTINGS: BreathingSettings = {
  breathsPerRound: 30,
  secondsPerBreath: 3.0,
  rounds: 3,
  recoveryHoldSeconds: 15,
  backgroundSound: 'ambient',
  breathSound: true,
  volume: 0.7,
};

export interface RoundResult {
  round: number;
  breaths: number;
  /** Hur länge andan hölls efter utandningen, i millisekunder. */
  retentionMs: number;
}

/**
 * Ett avslutat andningspass. Formen är tänkt att kunna sparas rakt av
 * i en databas senare (t.ex. en "sessions"-tabell + "rounds"-tabell).
 */
export interface BreathingSession {
  id: string;
  /** ISO-tidsstämpel. */
  startedAt: string;
  /** ISO-tidsstämpel. */
  endedAt: string;
  settings: Pick<
    BreathingSettings,
    'breathsPerRound' | 'secondsPerBreath' | 'rounds' | 'recoveryHoldSeconds'
  >;
  rounds: RoundResult[];
  /** Fylls i när det finns användarkonton. */
  userId?: string;
}

export type Phase =
  | 'idle'
  | 'getReady'
  | 'breathing'
  | 'retention'
  | 'recovery'
  | 'finished';
