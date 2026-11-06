import type { BackgroundSound, BreathingSettings } from '../types';

interface Props {
  settings: BreathingSettings;
  onChange: (settings: BreathingSettings) => void;
}

const PACE_PRESETS: { label: string; value: number }[] = [
  { label: 'Snabbt', value: 2.0 },
  { label: 'Normalt', value: 3.0 },
  { label: 'Lugnt', value: 4.5 },
];

const SOUNDS: { label: string; value: BackgroundSound }[] = [
  { label: 'Ambient', value: 'ambient' },
  { label: 'Hav', value: 'ocean' },
  { label: 'Inget', value: 'none' },
];

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, display, onChange }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="field">
      <span className="field-head">
        <span>{label}</span>
        <span className="field-value">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function SettingsPanel({ settings, onChange }: Props) {
  const set = <K extends keyof BreathingSettings>(key: K, value: BreathingSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="settings">
      <Slider
        label="Andetag per runda"
        value={settings.breathsPerRound}
        min={10}
        max={60}
        step={5}
        display={`${settings.breathsPerRound}`}
        onChange={(v) => set('breathsPerRound', v)}
      />

      <div className="field">
        <Slider
          label="Tempo"
          value={settings.secondsPerBreath}
          min={1.5}
          max={6}
          step={0.1}
          display={`${settings.secondsPerBreath.toFixed(1)} s / andetag`}
          onChange={(v) => set('secondsPerBreath', v)}
        />
        <div className="chips">
          {PACE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chip ${Math.abs(settings.secondsPerBreath - p.value) < 0.05 ? 'active' : ''}`}
              onClick={() => set('secondsPerBreath', p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Slider
        label="Rundor"
        value={settings.rounds}
        min={1}
        max={8}
        step={1}
        display={`${settings.rounds}`}
        onChange={(v) => set('rounds', v)}
      />

      <Slider
        label="Återhämtningsandetag"
        value={settings.recoveryHoldSeconds}
        min={5}
        max={30}
        step={1}
        display={`${settings.recoveryHoldSeconds} s`}
        onChange={(v) => set('recoveryHoldSeconds', v)}
      />

      <div className="field">
        <span className="field-head">
          <span>Bakgrundsljud</span>
        </span>
        <div className="segmented" role="radiogroup" aria-label="Bakgrundsljud">
          {SOUNDS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={settings.backgroundSound === s.value}
              className={settings.backgroundSound === s.value ? 'active' : ''}
              onClick={() => set('backgroundSound', s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <label className="toggle">
        <span>Andningsljud</span>
        <input
          type="checkbox"
          checked={settings.breathSound}
          onChange={(e) => set('breathSound', e.target.checked)}
        />
        <span className="toggle-track" aria-hidden="true" />
      </label>

      <Slider
        label="Volym"
        value={Math.round(settings.volume * 100)}
        min={0}
        max={100}
        step={5}
        display={`${Math.round(settings.volume * 100)}%`}
        onChange={(v) => set('volume', v / 100)}
      />
    </div>
  );
}
