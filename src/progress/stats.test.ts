import { describe, expect, it } from 'vitest';
import type { VideoProgress } from '../types';
import { computeStats, isInProgress } from './stats';
import { createVideoProgress } from './merge';
import { normalizeVideoId } from '../video/videoId';
import { dayKey, shiftDayKey } from '../utils/time';

const NOW = new Date('2026-03-15T12:00:00').getTime();
const DAY = 24 * 60 * 60 * 1000;

function video(overrides: Partial<VideoProgress> = {}): VideoProgress {
  const base = createVideoProgress({
    ref: normalizeVideoId('https://www.facebook.com/watch/?v=1234567890123456'),
    source: 'manual',
    now: NOW,
    title: 'Video',
    durationSec: 100,
    positionSec: 25,
  });
  return { ...base, ...overrides };
}

describe('isInProgress', () => {
  it('đúng khi đã xem một phần', () => {
    expect(isInProgress(video())).toBe(true);
  });

  it('sai khi chưa xem', () => {
    expect(isInProgress(video({ positionSec: 0, percent: 0 }))).toBe(false);
  });

  it('sai khi đã xem xong', () => {
    expect(isInProgress(video({ completed: true, positionSec: 100 }))).toBe(false);
  });
});

describe('computeStats', () => {
  it('trả về số 0 khi không có dữ liệu', () => {
    const stats = computeStats([], NOW);
    expect(stats.totalVideos).toBe(0);
    expect(stats.streakDays).toBe(0);
    expect(stats.byDay).toHaveLength(30);
    expect(stats.topTags).toEqual([]);
  });

  it('đếm đúng các nhóm', () => {
    const stats = computeStats(
      [
        video({ id: '1' }),
        video({ id: '2', completed: true, positionSec: 100, percent: 100 }),
        video({ id: '3', needsReview: true, positionSec: 0, percent: 0 }),
      ],
      NOW,
    );
    expect(stats.totalVideos).toBe(3);
    expect(stats.completedVideos).toBe(1);
    expect(stats.inProgressVideos).toBe(1);
    expect(stats.needsReviewVideos).toBe(1);
  });

  it('cộng tổng thời gian đã xem', () => {
    const stats = computeStats([video({ id: '1', totalWatchedSec: 30 }), video({ id: '2', totalWatchedSec: 45 })], NOW);
    expect(stats.totalWatchedSec).toBe(75);
  });

  it('đếm chuỗi ngày liên tiếp kết thúc hôm nay', () => {
    const stats = computeStats(
      [
        video({ id: '1', lastWatchedAt: NOW }),
        video({ id: '2', lastWatchedAt: NOW - DAY }),
        video({ id: '3', lastWatchedAt: NOW - 2 * DAY }),
      ],
      NOW,
    );
    expect(stats.streakDays).toBe(3);
  });

  it('cho phép chuỗi kết thúc ở hôm qua', () => {
    const stats = computeStats([video({ id: '1', lastWatchedAt: NOW - DAY })], NOW);
    expect(stats.streakDays).toBe(1);
  });

  it('ngắt chuỗi khi thiếu một ngày', () => {
    const stats = computeStats(
      [video({ id: '1', lastWatchedAt: NOW }), video({ id: '2', lastWatchedAt: NOW - 3 * DAY })],
      NOW,
    );
    expect(stats.streakDays).toBe(1);
  });

  it('byDay có đúng 7 phần tử khi yêu cầu 7 ngày', () => {
    const stats = computeStats([video()], NOW, 7);
    expect(stats.byDay).toHaveLength(7);
    expect(stats.byDay[6]?.key).toBe(dayKey(NOW));
    expect(stats.byDay[0]?.key).toBe(shiftDayKey(dayKey(NOW), -6));
  });

  it('đếm số video theo ngày', () => {
    const stats = computeStats(
      [video({ id: '1', lastWatchedAt: NOW }), video({ id: '2', lastWatchedAt: NOW - DAY })],
      NOW,
      7,
    );
    const today = stats.byDay[6];
    expect(today?.count).toBe(1);
    expect(stats.byDay[5]?.count).toBe(1);
  });

  it('sắp xếp topTags theo số lần dùng rồi theo tên', () => {
    const stats = computeStats(
      [
        video({ id: '1', tags: ['a', 'b'] }),
        video({ id: '2', tags: ['a'] }),
        video({ id: '3', tags: ['c'] }),
        video({ id: '4', tags: ['d'] }),
        video({ id: '5', tags: ['e'] }),
        video({ id: '6', tags: ['f'] }),
      ],
      NOW,
    );
    expect(stats.topTags[0]?.tag).toBe('a');
    expect(stats.topTags[0]?.count).toBe(2);
    expect(stats.topTags).toHaveLength(5);
  });

  it('không đếm thời gian âm', () => {
    const stats = computeStats([video({ totalWatchedSec: -100 })], NOW);
    expect(stats.totalWatchedSec).toBe(0);
  });
});
