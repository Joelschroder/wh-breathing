import { formatDurationPrecise } from '../format';
import type { BreathingSession } from '../types';

interface Props {
  session: BreathingSession;
  /** Bästa tid före detta pass (för att kunna visa "nytt rekord"). */
  previousBestMs: number | null;
  onAgain: () => void;
  onHome: () => void;
}

export function SummaryView({ session, previousBestMs, onAgain, onHome }: Props) {
  const times = session.rounds.map((r) => r.retentionMs);
  const best = times.length ? Math.max(...times) : 0;
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const isRecord = times.length > 0 && (previousBestMs === null || best > previousBestMs);

  return (
    <div className="panel summary">
      <h1 className="title">Bra jobbat</h1>
      {times.length === 0 ? (
        <p className="muted">Passet avslutades innan någon andhållning registrerades.</p>
      ) : (
        <>
          {isRecord && <p className="record-badge">Nytt personbästa!</p>}
          <div className="stats">
            <div>
              <span className="stat-value">{formatDurationPrecise(best)}</span>
              <span className="stat-label">Längsta</span>
            </div>
            <div>
              <span className="stat-value">{formatDurationPrecise(avg)}</span>
              <span className="stat-label">Snitt</span>
            </div>
            <div>
              <span className="stat-value">{times.length}</span>
              <span className="stat-label">Rundor</span>
            </div>
          </div>

          <ol className="round-bars">
            {session.rounds.map((r) => (
              <li key={r.round}>
                <span className="rb-label">Runda {r.round}</span>
                <span className="rb-track">
                  <span className="rb-fill" style={{ width: `${(r.retentionMs / best) * 100}%` }} />
                </span>
                <span className="rb-value">{formatDurationPrecise(r.retentionMs)}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="row-actions">
        <button type="button" className="btn ghost" onClick={onHome}>
          Till start
        </button>
        <button type="button" className="btn primary" onClick={onAgain}>
          Nytt pass
        </button>
      </div>
    </div>
  );
}
