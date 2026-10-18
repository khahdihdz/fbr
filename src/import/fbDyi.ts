import type { VideoProgress } from '../types';
import { createVideoProgress } from '../progress/merge';
import { looksLikeFacebookUrl, normalizeVideoId } from '../video/videoId';
import type { ParseResult } from './fbrJson';

const TITLE_KEYS = ['title', 'name', 'description', 'text', 'caption'];
const URL_KEYS = ['uri', 'href', 'url', 'watch_url', 'link', 'video_url'];
const TIME_KEYS = ['timestamp', 'watched_at', 'time', 'updated_at', 'creation_timestamp', 'created_at'];

const MAX_NODES = 50_000;
const MAX_DEPTH = 12;

export interface DyiCandidate {
  path: string;
  key: string;
  score: number;
  items: Record<string, unknown>[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keyScore(key: string): number {
  const k = key.toLowerCase();
  let score = 0;
  if (/label_values|metadata|privacy|ownership|comments|likes|reactions|friends|photos|posts/.test(k)) {
    score -= 6;
  }
  if (/video|reel/.test(k)) score += 3;
  if (/watch/.test(k)) score += 3;
  if (/history/.test(k)) score += 2;
  if (/your_activity|your_/.test(k)) score += 2;
  return score;
}

function itemScore(items: Record<string, unknown>[]): number {
  const sample = items.slice(0, 20);
  let withTitle = 0;
  let withUrl = 0;
  for (const item of sample) {
    if (TITLE_KEYS.some((key) => typeof item[key] === 'string')) withTitle += 1;
    if (URL_KEYS.some((key) => typeof item[key] === 'string')) withUrl += 1;
  }
  const ratio = (n: number): number => (sample.length === 0 ? 0 : n / sample.length);
  let score = 0;
  if (ratio(withUrl) >= 0.4) score += 3;
  if (ratio(withTitle) >= 0.4) score += 2;
  if (sample.length >= 2) score += 1;
  return score;
}

interface WalkState {
  nodes: number;
  truncated: boolean;
}

function walk(
  value: unknown,
  path: string,
  key: string,
  depth: number,
  state: WalkState,
  found: DyiCandidate[],
): void {
  if (depth > MAX_DEPTH || state.nodes > MAX_NODES) {
    state.truncated = true;
    return;
  }
  state.nodes += 1;

  if (Array.isArray(value)) {
    const objects = value.filter(isPlainObject);
    if (objects.length > 0 && objects.length >= Math.ceil(value.length / 2)) {
      const score = keyScore(key) + itemScore(objects);
      if (score >= 3) {
        found.push({ path, key, score, items: objects });
      }
    }
    for (let i = 0; i < value.length; i += 1) {
      walk(value[i], `${path}[${i}]`, key, depth + 1, state, found);
    }
    return;
  }

  if (isPlainObject(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      walk(childValue, path ? `${path}.${childKey}` : childKey, childKey, depth + 1, state, found);
    }
  }
}

/**
 * Dò các mảng có khả năng là lịch sử xem video trong file export
 * "Download your information" của Facebook.
 *
 * Định dạng export thay đổi theo thời gian và theo ngôn ngữ, nên hàm này dò
 * theo hình dạng dữ liệu thay vì hardcode đường dẫn. Trả về danh sách ứng viên
 * đã sắp xếp theo điểm, không có ứng viên nào nghĩa là không nhận diện được.
 */
export function findWatchHistoryCandidates(root: unknown, limit = 5): DyiCandidate[] {
  const found: DyiCandidate[] = [];
  const state: WalkState = { nodes: 0, truncated: false };
  walk(root, '', '', 0, state, found);
  return found
    .sort((a, b) => b.score - a.score || b.items.length - a.items.length)
    .slice(0, Math.max(0, limit));
}

function pickString(item: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Đọc giá trị từ mảng label_values dạng [{ label, value }]. */
function pickLabelValue(item: Record<string, unknown>, wanted: string[]): string | null {
  const labels = item['label_values'];
  if (!Array.isArray(labels)) return null;
  for (const raw of labels) {
    if (!isPlainObject(raw)) continue;
    const label = raw['label'];
    const value = raw['value'];
    if (typeof label !== 'string' || typeof value !== 'string' || !value.trim()) continue;
    if (wanted.some((w) => label.toLowerCase().includes(w))) return value.trim();
  }
  return null;
}

function pickTimestamp(item: Record<string, unknown>): number | null {
  for (const key of TIME_KEYS) {
    const value = item[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 0 && value < 1e12 ? Math.round(value * 1000) : Math.round(value);
    }
    if (typeof value === 'string' && value.trim()) {
      const asNumber = Number(value);
      if (Number.isFinite(asNumber) && asNumber > 0) {
        return asNumber < 1e12 ? Math.round(asNumber * 1000) : Math.round(asNumber);
      }
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  const nested = item['metadata'];
  if (isPlainObject(nested)) {
    const value = nested['timestamp'];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 0 && value < 1e12 ? Math.round(value * 1000) : Math.round(value);
    }
  }
  return null;
}

/** Chuyển một mục trong file export thành bản ghi. */
export function dyiItemToVideo(item: Record<string, unknown>, now: number): VideoProgress | null {
  const title = pickString(item, TITLE_KEYS) ?? pickLabelValue(item, ['title', 'name', 'tiêu đề']);
  const url = pickString(item, URL_KEYS) ?? pickLabelValue(item, ['url', 'link', 'đường dẫn', 'liên kết']);
  const timestamp = pickTimestamp(item);

  if (!url && !title) return null;

  const ref =
    url && looksLikeFacebookUrl(url)
      ? normalizeVideoId(url)
      : normalizeVideoId(`fb-export:${url ?? title ?? ''}`);

  if (!url && !title) return null;

  return createVideoProgress({
    ref,
    source: 'fb_export',
    now,
    title: title ?? undefined,
    lastWatchedAt: timestamp ?? now,
    needsReview: true,
    tags: ['fb_export'],
    note: 'Có trong lịch sử xem của Facebook (không kèm vị trí phút:giây)',
  });
}

export interface DyiParseOptions {
  now: number;
  /** Bỏ qua việc chọn ứng viên, chỉ dùng ứng viên có path này. */
  path?: string;
}

/**
 * Phân tích file/thư mục export của Facebook.
 *
 * Trả về ok = false kèm danh sách key tìm được khi không nhận diện được cấu
 * trúc, để người dùng gửi lại thông tin và KHÔNG import dữ liệu rác.
 */
export function parseDyi(input: string | unknown, options: DyiParseOptions): ParseResult<VideoProgress[]> {
  let root: unknown = input;
  if (typeof input === 'string') {
    try {
      root = JSON.parse(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'lỗi không xác định';
      return { ok: false, errors: [`JSON không hợp lệ: ${message}`], warnings: [], value: [] };
    }
  }

  const warnings: string[] = [];
  const candidates = findWatchHistoryCandidates(root, 8).filter(
    (candidate) => !options.path || candidate.path === options.path,
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      errors: [
        'Không nhận diện được cấu trúc lịch sử xem video trong file này.',
        'Hãy kiểm tra bạn đã chọn mục "Video đã xem" / "Video watch history" khi yêu cầu dữ liệu từ Facebook.',
      ],
      warnings,
      value: [],
    };
  }

  const videos: VideoProgress[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const candidate of candidates) {
    for (const item of candidate.items) {
      const video = dyiItemToVideo(item, options.now);
      if (!video) {
        skipped += 1;
        continue;
      }
      if (seen.has(video.id)) continue;
      seen.add(video.id);
      videos.push(video);
    }
  }

  if (videos.length === 0) {
    return {
      ok: false,
      errors: ['Tìm thấy mảng ứng viên nhưng không có mục nào đọc được.'],
      warnings,
      value: [],
    };
  }

  if (candidates.length > 1) {
    warnings.push(
      `Tìm thấy ${candidates.length} nhóm dữ liệu khả nghi và đã gộp lại. Kiểm tra lại danh sách giúp mình.`,
    );
  }
  if (skipped > 0) warnings.push(`Bỏ qua ${skipped} mục thiếu tiêu đề lẫn link.`);

  return { ok: true, errors: [], warnings, value: videos };
}
