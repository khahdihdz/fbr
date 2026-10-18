import type { VideoProgress } from '../types';
import { dayKey, shiftDayKey } from '../utils/time';

export interface DayCount {
  key: string;
  count: number;
}

export interface Stats {
  totalVideos: number;
  completedVideos: number;
  inProgressVideos: number;
  needsReviewVideos: number;
  totalWatchedSec: number;
  byDay: DayCount[];
  streakDays: number;
  topTags: Array<{ tag: string; count: number }>;
}

export function isInProgress(video: VideoProgress): boolean {
  return !video.completed && video.positionSec > 0;
}

/** Tính các số liệu tổng hợp. Hàm thuần, `now` được truyền vào để test ổn định. */
export function computeStats(videos: VideoProgress[], now: number, days = 30): Stats {
  let totalWatchedSec = 0;
  let completedVideos = 0;
  let inProgressVideos = 0;
  let needsReviewVideos = 0;

  const daySet = new Map<string, number>();
  const tagCount = new Map<string, number>();

  for (const video of videos) {
    totalWatchedSec += Math.max(0, video.totalWatchedSec);
    if (video.completed) completedVideos += 1;
    if (isInProgress(video)) inProgressVideos += 1;
    if (video.needsReview) needsReviewVideos += 1;

    const key = dayKey(video.lastWatchedAt);
    daySet.set(key, (daySet.get(key) ?? 0) + 1);

    for (const tag of video.tags ?? []) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
  }

  const byDay: DayCount[] = [];
  let cursor = dayKey(now);
  for (let i = 0; i < days; i += 1) {
    byDay.unshift({ key: cursor, count: daySet.get(cursor) ?? 0 });
    cursor = shiftDayKey(cursor, -1);
  }

  let streakDays = 0;
  let streakCursor = dayKey(now);
  if (!daySet.has(streakCursor)) streakCursor = shiftDayKey(streakCursor, -1);
  while (daySet.has(streakCursor)) {
    streakDays += 1;
    streakCursor = shiftDayKey(streakCursor, -1);
  }

  const topTags = [...tagCount.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 5);

  return {
    totalVideos: videos.length,
    completedVideos,
    inProgressVideos,
    needsReviewVideos,
    totalWatchedSec,
    byDay,
    streakDays,
    topTags,
  };
}
