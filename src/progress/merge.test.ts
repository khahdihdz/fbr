import { describe, expect, it } from 'vitest';
import type { VideoProgress } from '../types';
import { createVideoProgress, mergeMany, mergeVideo, pickBetter } from './merge';
import { normalizeVideoId } from '../video/videoId';

const NOW = 1_700_000_000_000;

function ref(id = '1234567890123456') {
  return normalizeVideoId(`https://www.facebook.com/watch/?v=${id}`);
}

function make(overrides: Partial<VideoProgress> = {}): VideoProgress {
  const base = createVideoProgress({
    ref: ref(),
    source: 'manual',
    now: NOW,
    title: 'Video gốc',
    durationSec: 100,
    positionSec: 20,
  });
  return { ...base, ...overrides };
}

describe('createVideoProgress', () => {
  it('tính phần trăm và cờ hoàn thành', () => {
    const video = createVideoProgress({
      ref: ref(),
      source: 'manual',
      now: NOW,
      title: 'A',
      durationSec: 100,
      positionSec: 96,
    });
    expect(video.percent).toBe(96);
    expect(video.completed).toBe(true);
  });

  it('đánh dấu needsReview khi thiếu thời lượng', () => {
    const video = createVideoProgress({ ref: ref(), source: 'link_paste', now: NOW, title: 'A' });
    expect(video.needsReview).toBe(true);
    expect(video.percent).toBe(0);
  });

  it('đánh dấu needsReview khi tiêu đề là tiêu đề tạm', () => {
    const video = createVideoProgress({
      ref: ref(),
      source: 'manual',
      now: NOW,
      durationSec: 100,
      positionSec: 10,
    });
    expect(video.title).toContain('Video');
    expect(video.needsReview).toBe(true);
  });

  it('không đánh dấu needsReview khi có tiêu đề thật và thời lượng', () => {
    const video = createVideoProgress({
      ref: ref(),
      source: 'manual',
      now: NOW,
      title: 'Hướng dẫn nấu ăn',
      durationSec: 100,
      positionSec: 10,
    });
    expect(video.needsReview).toBe(false);
  });

  it('gán độ tin cậy theo nguồn', () => {
    expect(createVideoProgress({ ref: ref(), source: 'fb_export', now: NOW }).confidence).toBe('high');
    expect(createVideoProgress({ ref: ref(), source: 'manual', now: NOW }).confidence).toBe('medium');
    expect(createVideoProgress({ ref: ref(), source: 'link_paste', now: NOW }).confidence).toBe('low');
  });
});

describe('pickBetter', () => {
  it('ưu tiên độ tin cậy cao hơn', () => {
    const low = make({ confidence: 'low', positionSec: 90, lastWatchedAt: NOW + 1000 });
    const high = make({ confidence: 'high', positionSec: 10, lastWatchedAt: NOW });
    expect(pickBetter(low, high)).toBe(high);
  });

  it('cùng độ tin cậy thì ưu tiên mới hơn', () => {
    const older = make({ lastWatchedAt: NOW });
    const newer = make({ lastWatchedAt: NOW + 5000, positionSec: 10 });
    expect(pickBetter(older, newer)).toBe(newer);
  });

  it('cùng thời điểm thì ưu tiên vị trí xa hơn', () => {
    const a = make({ positionSec: 10 });
    const b = make({ positionSec: 50 });
    expect(pickBetter(a, b)).toBe(b);
  });
});

describe('mergeVideo', () => {
  it('trả về bản ghi mới khi chưa tồn tại', () => {
    const result = mergeVideo(undefined, make());
    expect(result.isNew).toBe(true);
    expect(result.changed).toBe(true);
  });

  it('giữ firstSeenAt cũ nhất và lastWatchedAt mới nhất', () => {
    const existing = make({ firstSeenAt: NOW - 10_000, lastWatchedAt: NOW - 5_000 });
    const incoming = make({ source: 'fb_export', firstSeenAt: NOW, lastWatchedAt: NOW + 1_000, positionSec: 30 });
    const result = mergeVideo(existing, incoming);
    expect(result.video.firstSeenAt).toBe(NOW - 10_000);
    expect(result.video.lastWatchedAt).toBe(NOW + 1_000);
  });

  it('không đếm trùng totalWatchedSec và watchCount', () => {
    const existing = make({ totalWatchedSec: 500, watchCount: 4 });
    const incoming = make({ source: 'fb_export', totalWatchedSec: 120, watchCount: 2 });
    const result = mergeVideo(existing, incoming);
    expect(result.video.totalWatchedSec).toBe(500);
    expect(result.video.watchCount).toBe(4);
  });

  it('giữ tiêu đề thật thay vì tiêu đề tạm', () => {
    const existing = make({ title: 'Video 1234567890123456' });
    const incoming = make({ source: 'fb_export', title: 'Tiêu đề thật' });
    expect(mergeVideo(existing, incoming).video.title).toBe('Tiêu đề thật');
    expect(mergeVideo(incoming, existing).video.title).toBe('Tiêu đề thật');
  });

  it('gộp tag và sắp xếp', () => {
    const existing = make({ tags: ['b'] });
    const incoming = make({ source: 'fb_export', tags: ['a', 'b'] });
    expect(mergeVideo(existing, incoming).video.tags).toEqual(['a', 'b']);
  });

  it('tính lại percent và completed sau khi gộp', () => {
    const existing = make({ durationSec: 100, positionSec: 50 });
    const incoming = make({ source: 'manual', durationSec: 100, positionSec: 96, lastWatchedAt: NOW + 1 });
    const result = mergeVideo(existing, incoming);
    expect(result.video.percent).toBe(96);
    expect(result.video.completed).toBe(true);
  });

  it('ghi lại lịch sử khi trường thay đổi', () => {
    const existing = make({ positionSec: 10 });
    const incoming = make({ source: 'manual', positionSec: 60, lastWatchedAt: NOW + 1 });
    const result = mergeVideo(existing, incoming);
    expect(result.video.history?.some((entry) => entry.field === 'positionSec')).toBe(true);
  });

  it('báo changed = false khi dữ liệu trùng khớp', () => {
    const existing = make();
    const incoming = make();
    const result = mergeVideo(existing, incoming);
    expect(result.changed).toBe(false);
    expect(result.isNew).toBe(false);
  });

  it('xoá tag khi cả hai đều không có tag', () => {
    const existing = make();
    const incoming = make();
    const result = mergeVideo(existing, incoming);
    expect(result.video.tags).toBeUndefined();
  });
});

describe('mergeMany', () => {
  it('đếm đúng thêm mới, cập nhật, bỏ qua', () => {
    const shared = { positionSec: 10, durationSec: 100, percent: 10 };
    const existing = [make({ id: 'a', title: 'A', ...shared })];
    const incoming = [
      make({ id: 'a', title: 'A', ...shared }),
      make({ id: 'b', title: 'B', ...shared }),
      make({ id: 'c', title: 'C', ...shared }),
    ];
    const summary = mergeMany(existing, incoming);
    expect(summary.skipped).toBe(1);
    expect(summary.added).toBe(2);
    expect(summary.videos).toHaveLength(3);
  });

  it('không tạo bản ghi trùng id', () => {
    const summary = mergeMany([], [make({ id: 'x' }), make({ id: 'x' })]);
    expect(summary.videos).toHaveLength(1);
    expect(summary.added).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});
