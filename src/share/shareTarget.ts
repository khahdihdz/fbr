import { extractAllUrls, normalizeVideoId } from '../video/videoId';
import type { VideoRef } from '../types';

export const SHARE_KEY = 'fbr:share:pending';

export interface SharePayload {
  url: string;
  text: string;
  title: string;
  receivedAt: number;
}

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Đọc tham số Web Share Target từ query string. */
export function readShareFromLocation(search: string): SharePayload | null {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const url = params.get('url') ?? '';
  const text = params.get('text') ?? '';
  const title = params.get('title') ?? '';
  if (!url && !text && !title) return null;
  return { url, text, title, receivedAt: Date.now() };
}

export function savePendingShare(storage: SessionStorageLike, payload: SharePayload): void {
  storage.setItem(SHARE_KEY, JSON.stringify(payload));
}

export function consumePendingShare(storage: SessionStorageLike): SharePayload | null {
  const raw = storage.getItem(SHARE_KEY);
  storage.removeItem(SHARE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<SharePayload>;
    if (typeof candidate.url !== 'string' && typeof candidate.text !== 'string') return null;
    return {
      url: typeof candidate.url === 'string' ? candidate.url : '',
      text: typeof candidate.text === 'string' ? candidate.text : '',
      title: typeof candidate.title === 'string' ? candidate.title : '',
      receivedAt: typeof candidate.receivedAt === 'number' ? candidate.receivedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Trích tham chiếu video từ nội dung được chia sẻ.
 * Ưu tiên tham số `url`, sau đó quét `text` (nhiều app nhét link lẫn văn bản).
 */
export function refFromShare(payload: SharePayload): VideoRef | null {
  const candidates: string[] = [];
  if (payload.url) candidates.push(payload.url);
  if (payload.text) candidates.push(...extractAllUrls(payload.text));
  if (payload.title) candidates.push(...extractAllUrls(payload.title));

  for (const candidate of candidates) {
    const ref = normalizeVideoId(candidate);
    if (ref.kind !== 'unknown') return ref;
  }

  if (payload.title && payload.title.trim()) {
    const ref = normalizeVideoId(`share-title:${payload.title.trim()}`);
    return { ...ref, kind: 'unknown', resolvedBy: 'hash' };
  }

  return null;
}
