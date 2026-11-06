import type { BreathingSession } from '../types';

/**
 * Abstraktion för lagring av andningspass.
 *
 * Allt är asynkront med flit, så att en databas-implementation
 * (t.ex. Supabase, Firebase eller ett eget REST-API) kan ersätta
 * localStorage-varianten utan att resten av appen behöver ändras.
 */
export interface SessionRepository {
  list(): Promise<BreathingSession[]>;
  save(session: BreathingSession): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}
