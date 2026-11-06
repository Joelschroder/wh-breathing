import type { BreathingSession } from '../types';
import type { SessionRepository } from './SessionRepository';

const KEY = 'wh-breathing:sessions:v1';

export class LocalStorageSessionRepository implements SessionRepository {
  private read(): BreathingSession[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as BreathingSession[]) : [];
    } catch {
      return [];
    }
  }

  private write(sessions: BreathingSession[]): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(sessions));
    } catch {
      // Lagring kan vara blockerad (t.ex. privat läge) – appen ska fortfarande fungera.
    }
  }

  async list(): Promise<BreathingSession[]> {
    return this.read().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async save(session: BreathingSession): Promise<void> {
    const sessions = this.read().filter((s) => s.id !== session.id);
    sessions.push(session);
    this.write(sessions);
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((s) => s.id !== id));
  }

  async clear(): Promise<void> {
    this.write([]);
  }
}
