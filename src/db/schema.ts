import { SCHEMA_ID, type VideoProgress } from '../types';
import { computePercent, isCompleted } from '../progress/percent';
import { confidenceForSource, isPlaceholderTitle } from '../progress/confidence';
import { placeholderTitle } from '../video/videoId';
import { round1 } from '../utils/time';

export const DB_NAME = 'fbr';
export const DB_VERSION = 1;
export const STORE_VIDEOS = 'videos';
export const STORE_META = 'meta';
export const INDEX_LAST_WATCHED = 'lastWatchedAt';
export const INDEX_COMPLETED = 'completed';

/** Tạo cấu trúc object store. Chạy trong onupgradeneeded. */
export function upgradeDatabase(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
      const store = db.createObjectStore(STORE_VIDEOS, { keyPath: 'id' });
      store.createIndex(INDEX_LAST_WATCHED, 'lastWatchedAt', { unique: false });
      store.createIndex(INDEX_COMPLETED, 'completed', { unique: false });
    }
    if (!db.objectStoreNames.contains(STORE_META)) {
      db.createObjectStore(STORE_META);
    }
  }
  // v2 trở đi: thêm nhánh migrate tương ứng ở đây và trong migrateVideo().
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Chuyển đổi một bản ghi thô (kể cả dữ liệu cũ hoặc từ file import lạ) thành
 * `VideoProgress` hợp lệ. Trả về null nếu không thể cứu được.
 *
 * Hỗ trợ tên trường cũ: duration_ms, position_ms, updated_at, watched_at.
 */
export function migrateVideo(raw: unknown): VideoProgress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;

  const id = asString(input['id']).trim();
  const url = asString(input['url']).trim();
  if (!id && !url) return null;

  const durationRaw =
    input['durationSec'] !== undefined
      ? asNumber(input['durationSec'])
      : asNumber(input['duration_ms']) / 1000;
  const positionRaw =
    input['positionSec'] !== undefined
      ? asNumber(input['positionSec'])
      : asNumber(input['position_ms']) / 1000;

  const durationSec = Math.max(0, round1(durationRaw));
  const positionSec = durationSec > 0
    ? Math.max(0, Math.min(durationSec, round1(positionRaw)))
    : Math.max(0, round1(positionRaw));

  const sourceRaw = asString(input['source'], 'manual');
  const allowed = ['share_target', 'session_estimate', 'manual', 'fb_export', 'link_paste'];
  const source = (allowed.includes(sourceRaw) ? sourceRaw : 'manual') as VideoProgress['source'];

  const lastWatchedAt =
    input['lastWatchedAt'] !== undefined
      ? asNumber(input['lastWatchedAt'])
      : input['updated_at'] !== undefined
        ? asNumber(input['updated_at'])
        : input['watched_at'] !== undefined
          ? asNumber(input['watched_at'])
          : 0;

  const firstSeenAt =
    input['firstSeenAt'] !== undefined ? asNumber(input['firstSeenAt']) : lastWatchedAt;

  const title = asString(input['title']).trim();
  const percent = computePercent(positionSec, durationSec);

  const tags = Array.isArray(input['tags'])
    ? (input['tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
    : undefined;

  const history = Array.isArray(input['history'])
    ? (input['history'] as unknown[]).filter(
        (h): h is Record<string, unknown> => typeof h === 'object' && h !== null,
      )
    : [];

  const video: VideoProgress = {
    id: id || url,
    url,
    title: title || placeholderTitle({ id: id || url, kind: 'unknown', resolvedBy: 'unknown', webUrl: url, isNumericId: false }),
    source,
    confidence: confidenceForSource(source),
    resolvedBy:
      input['resolvedBy'] === 'url' ||
      input['resolvedBy'] === 'shortlink' ||
      input['resolvedBy'] === 'hash'
        ? input['resolvedBy']
        : 'unknown',
    durationSec,
    positionSec,
    percent,
    completed: isCompleted(percent),
    watchCount: Math.max(0, Math.floor(asNumber(input['watchCount'], 1))),
    totalWatchedSec: Math.max(0, asNumber(input['totalWatchedSec'], positionSec)),
    firstSeenAt: firstSeenAt || lastWatchedAt,
    lastWatchedAt,
    needsReview:
      input['needsReview'] === undefined
        ? durationSec <= 0 || isPlaceholderTitle(title)
        : input['needsReview'] === true,
    history: history.slice(-50).map((entry) => ({
      at: asNumber(entry['at']),
      field: asString(entry['field'], 'unknown'),
      from: (entry['from'] ?? null) as string | number | null,
      to: (entry['to'] ?? null) as string | number | null,
      source,
    })),
  };

  const note = asString(input['note']).trim();
  if (note) video.note = note;
  if (tags && tags.length > 0) video.tags = [...tags];
  const deepLink = asString(input['fbDeepLink']).trim();
  if (deepLink) video.fbDeepLink = deepLink;

  return video;
}

/** Schema đang được hỗ trợ khi import. */
export function isSupportedSchema(value: unknown): value is typeof SCHEMA_ID {
  return value === SCHEMA_ID;
}
