import { LocalStorageSessionRepository } from './LocalStorageSessionRepository';
import type { SessionRepository } from './SessionRepository';

export type { SessionRepository };

/**
 * Den repository-instans som appen använder.
 * Byt ut här när en riktig databas läggs till, t.ex.:
 *   export const sessionRepository = new SupabaseSessionRepository(client);
 */
export const sessionRepository: SessionRepository = new LocalStorageSessionRepository();
