/**
 * Phiên "rời webapp để mở app Facebook".
 *
 * Webapp KHÔNG đọc được tiến trình từ app Facebook. Ghi lại thời điểm rời đi
 * chỉ cho phép ước lượng thời gian đã trôi qua, và luôn phải hỏi lại người dùng.
 */
export const SESSION_KEY = 'fbr:session';

export interface PendingSession {
  id: string;
  title: string;
  startedAt: number;
  positionSec: number;
  durationSec: number;
  source: 'deep_link' | 'http';
}

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function beginSession(storage: SessionStorageLike, session: Omit<PendingSession, 'startedAt'> & { startedAt?: number }): PendingSession {
  const full: PendingSession = {
    id: session.id,
    title: session.title,
    startedAt: session.startedAt ?? Date.now(),
    positionSec: session.positionSec,
    durationSec: session.durationSec,
    source: session.source,
  };
  storage.setItem(SESSION_KEY, JSON.stringify(full));
  return full;
}

export function readSession(storage: SessionStorageLike): PendingSession | null {
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<PendingSession>;
    if (typeof candidate.id !== 'string' || typeof candidate.startedAt !== 'number') return null;
    return {
      id: candidate.id,
      title: typeof candidate.title === 'string' ? candidate.title : candidate.id,
      startedAt: candidate.startedAt,
      positionSec: typeof candidate.positionSec === 'number' ? candidate.positionSec : 0,
      durationSec: typeof candidate.durationSec === 'number' ? candidate.durationSec : 0,
      source: candidate.source === 'http' ? 'http' : 'deep_link',
    };
  } catch {
    return null;
  }
}

export function endSession(storage: SessionStorageLike): PendingSession | null {
  const session = readSession(storage);
  storage.removeItem(SESSION_KEY);
  return session;
}

export function elapsedMs(session: PendingSession, now: number): number {
  return now - session.startedAt;
}
