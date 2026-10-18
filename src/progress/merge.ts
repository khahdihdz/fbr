import {
  HISTORY_LIMIT,
  type Source,
  type VideoProgress,
  type VideoRef,
} from '../types';
import { placeholderTitle } from '../video/videoId';
import { confidenceForSource, confidenceRank, isPlaceholderTitle } from './confidence';
import { computePercent, isCompleted } from './percent';

export interface CreateVideoInput {
  ref: VideoRef;
  source: Source;
  now: number;
  title?: string;
  durationSec?: number;
  positionSec?: number;
  note?: string;
  tags?: string[];
  lastWatchedAt?: number;
  needsReview?: boolean;
  watchCount?: number;
  totalWatchedSec?: number;
}

/** Tạo bản ghi mới với đầy đủ giá trị mặc định nhất quán. */
export function createVideoProgress(input: CreateVideoInput): VideoProgress {
  const durationSec = Math.max(0, input.durationSec ?? 0);
  const positionSec = Math.max(0, input.positionSec ?? 0);
  const percent = computePercent(positionSec, durationSec);
  const lastWatchedAt = input.lastWatchedAt ?? input.now;
  const title = input.title?.trim() ? input.title.trim() : placeholderTitle(input.ref);

  const video: VideoProgress = {
    id: input.ref.id,
    url: input.ref.webUrl,
    title,
    source: input.source,
    confidence: confidenceForSource(input.source),
    resolvedBy: input.ref.resolvedBy,
    durationSec,
    positionSec,
    percent,
    completed: isCompleted(percent),
    watchCount: Math.max(1, input.watchCount ?? 1),
    totalWatchedSec: Math.max(0, input.totalWatchedSec ?? positionSec),
    firstSeenAt: input.now,
    lastWatchedAt,
    needsReview: input.needsReview ?? (durationSec <= 0 || isPlaceholderTitle(title)),
    history: [],
  };
  if (input.note) video.note = input.note;
  if (input.tags && input.tags.length > 0) video.tags = [...input.tags];
  return video;
}

function cloneHistory(entry: VideoProgress['history']): NonNullable<VideoProgress['history']> {
  const list = entry ?? [];
  return list.slice(-HISTORY_LIMIT);
}

/** Chọn bản ghi "thắng" giữa hai bản cùng id. */
export function pickBetter(a: VideoProgress, b: VideoProgress): VideoProgress {
  const rankA = confidenceRank(a.confidence);
  const rankB = confidenceRank(b.confidence);
  if (rankA !== rankB) return rankA > rankB ? a : b;
  if (a.lastWatchedAt !== b.lastWatchedAt) return a.lastWatchedAt > b.lastWatchedAt ? a : b;
  if (a.positionSec !== b.positionSec) return a.positionSec > b.positionSec ? a : b;
  if (a.durationSec !== b.durationSec) return a.durationSec > b.durationSec ? a : b;
  return a;
}

function pickTitle(existing: VideoProgress, incoming: VideoProgress): string {
  const existingOk = !isPlaceholderTitle(existing.title);
  const incomingOk = !isPlaceholderTitle(incoming.title);
  if (existingOk && incomingOk) {
    return existing.lastWatchedAt >= incoming.lastWatchedAt ? existing.title : incoming.title;
  }
  if (existingOk) return existing.title;
  if (incomingOk) return incoming.title;
  return incoming.title || existing.title;
}

function unionTags(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  const set = new Set<string>();
  for (const tag of a ?? []) set.add(tag);
  for (const tag of b ?? []) set.add(tag);
  if (set.size === 0) return undefined;
  return [...set].sort((x, y) => x.localeCompare(y));
}

function diffHistory(
  base: VideoProgress,
  merged: VideoProgress,
  source: Source,
): NonNullable<VideoProgress['history']> {
  const entries = cloneHistory(base.history);
  const fields: Array<keyof VideoProgress> = ['title', 'positionSec', 'durationSec', 'completed', 'note'];
  for (const field of fields) {
    const from = base[field];
    const to = merged[field];
    if (from !== to && (typeof from !== 'object' || from === undefined)) {
      entries.push({
        at: merged.lastWatchedAt,
        field: String(field),
        from: (from ?? null) as string | number | null,
        to: (to ?? null) as string | number | null,
        source,
      });
    }
  }
  return entries.slice(-HISTORY_LIMIT);
}

export interface MergeResult {
  video: VideoProgress;
  changed: boolean;
  isNew: boolean;
}

/**
 * Gộp một bản ghi mới vào bản ghi cũ.
 *
 * Thứ tự quyết định: độ tin cậy nguồn > lastWatchedAt > positionSec > durationSec.
 * totalWatchedSec và watchCount lấy giá trị lớn hơn để tránh đếm trùng khi import.
 */
export function mergeVideo(existing: VideoProgress | undefined, incoming: VideoProgress): MergeResult {
  if (!existing) {
    return { video: { ...incoming, history: cloneHistory(incoming.history) }, changed: true, isNew: true };
  }

  const winner = pickBetter(existing, incoming);
  const merged: VideoProgress = {
    ...winner,
    id: existing.id,
    title: pickTitle(existing, incoming),
    firstSeenAt: Math.min(existing.firstSeenAt, incoming.firstSeenAt),
    lastWatchedAt: Math.max(existing.lastWatchedAt, incoming.lastWatchedAt),
    watchCount: Math.max(existing.watchCount, incoming.watchCount),
    totalWatchedSec: Math.max(existing.totalWatchedSec, incoming.totalWatchedSec),
    needsReview: winner.needsReview,
    tags: unionTags(existing.tags, incoming.tags),
    url: winner.url || existing.url || incoming.url,
  };

  const percent = computePercent(merged.positionSec, merged.durationSec);
  merged.percent = percent;
  merged.completed = isCompleted(percent);

  if (!merged.note) {
    const note = existing.note ?? incoming.note;
    if (note) merged.note = note;
  }
  if (!merged.tags) delete merged.tags;
  if (!merged.note) delete merged.note;

  merged.history = diffHistory(existing, merged, incoming.source);

  const changed =
    existing.title !== merged.title ||
    existing.positionSec !== merged.positionSec ||
    existing.durationSec !== merged.durationSec ||
    existing.percent !== merged.percent ||
    existing.completed !== merged.completed ||
    existing.needsReview !== merged.needsReview ||
    existing.note !== merged.note ||
    JSON.stringify(existing.tags ?? []) !== JSON.stringify(merged.tags ?? []);

  return { video: merged, changed, isNew: false };
}

export interface MergeSummary {
  videos: VideoProgress[];
  added: number;
  updated: number;
  skipped: number;
}

/** Gộp một loạt bản ghi vào danh sách hiện có. */
export function mergeMany(
  existing: VideoProgress[],
  incoming: VideoProgress[],
): MergeSummary {
  const byId = new Map<string, VideoProgress>();
  for (const video of existing) byId.set(video.id, video);

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const candidate of incoming) {
    const result = mergeVideo(byId.get(candidate.id), candidate);
    if (result.isNew) {
      added += 1;
      byId.set(result.video.id, result.video);
    } else if (result.changed) {
      updated += 1;
      byId.set(result.video.id, result.video);
    } else {
      skipped += 1;
    }
  }

  return { videos: [...byId.values()], added, updated, skipped };
}
