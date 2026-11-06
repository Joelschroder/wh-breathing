import { formatDate, formatDuration, formatDurationPrecise } from '../format';
import type { BreathingSession } from '../types';

interface Props {
  sessions: BreathingSession[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onBack: () => void;
}

export function HistoryView({ sessions, onDelete, onClear, onBack }: Props) {
  const all = sessions.flatMap((s) => s.rounds.map((r) => r.retentionMs));
  const best = all.length ? Math.max(...all) : null;
  const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;

  // Trend: bästa tid per pass, äldst → nyast (max 20 senaste).
  const trend = sessions
    .slice(0, 20)
    .reverse()
    .map((s) => (s.rounds.length ? Math.max(...s.rounds.map((r) => r.retentionMs)) : 0));
  const trendMax = Math.max(1, ...trend);

  return (
    <div className="panel history">
      <div className="panel-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Tillbaka">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 className="title small">Historik</h1>
        <span style={{ width: 40 }} />
      </div>

      {sessions.length === 0 ? (
        <p className="muted center-text">Inga pass ännu. Dina andhållningstider sparas här.</p>
      ) : (
        <>
          <div className="stats">
            <div>
              <span className="stat-value">{best !== null ? formatDurationPrecise(best) : '–'}</span>
              <span className="stat-label">Personbästa</span>
            </div>
            <div>
              <span className="stat-value">{avg !== null ? formatDurationPrecise(avg) : '–'}</span>
              <span className="stat-label">Snitt</span>
            </div>
            <div>
              <span className="stat-value">{sessions.length}</span>
              <span className="stat-label">Pass</span>
            </div>
          </div>

          {trend.length > 1 && (
            <div className="trend" aria-label="Längsta andhållning per pass">
              {trend.map((v, i) => (
                <span key={i} style={{ height: `${Math.max(4, (v / trendMax) * 100)}%` }} title={formatDuration(v)} />
              ))}
            </div>
          )}

          <ul className="session-list">
            {sessions.map((s) => (
              <li key={s.id}>
                <div className="sl-head">
                  <span className="sl-date">{formatDate(s.startedAt)}</span>
                  <button type="button" className="link danger" onClick={() => onDelete(s.id)}>
                    Ta bort
                  </button>
                </div>
                <div className="sl-meta">
                  {s.settings.breathsPerRound} andetag · {s.settings.secondsPerBreath.toFixed(1)} s tempo
                </div>
                <div className="sl-rounds">
                  {s.rounds.map((r) => (
                    <span key={r.round} className={`pill ${best !== null && r.retentionMs === best ? 'best' : ''}`}>
                      {formatDuration(r.retentionMs)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="link danger center-text"
            onClick={() => {
              if (confirm('Radera all historik?')) onClear();
            }}
          >
            Rensa all historik
          </button>
        </>
      )}
    </div>
  );
}
