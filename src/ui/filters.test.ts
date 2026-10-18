import { describe, expect, it } from 'vitest';
import type { VideoProgress } from '../types';
import {
  DEFAULT_FILTER_STATE,
  filterAndSort,
  filterVideos,
  inTab,
  matchesSearch,
  normalizeSearch,
  sortVideos,
  tabCounts,
} from './filters';
import { createVideoProgress } from '../progress/merge';
import { normalizeVideoId } from '../video/videoId';

const NOW = 1_700_000_000_000;

let seq = 0;
function video(overrides: Partial<VideoProgress> = {}): VideoProgress {
  seq += 1;
  const base = createVideoProgress({
    ref: normalizeVideoId(`https://www.facebook.com/watch/?v=100000000000${String(seq).padStart(4, '0')}`),
    source: 'manual',
    now: NOW,
    title: `Video ${seq}`,
    durationSec: 100,
    positionSec: 20,
  });
  return { ...base, ...overrides };
}

describe('normalizeSearch', () => {
  it('bỏ dấu tiếng Việt và hạ chữ thường', () => {
    expect(normalizeSearch('Hướng Dẫn Đường Phố')).toBe('huong dan duong pho');
  });

  it('xử lý đ/Đ', () => {
    expect(normalizeSearch('Đà Nẵng')).toBe('da nang');
  });

  it('cắt khoảng trắng thừa', () => {
    expect(normalizeSearch('  abc  ')).toBe('abc');
  });
});

describe('matchesSearch', () => {
  it('khớp không phân biệt dấu', () => {
    expect(matchesSearch(video({ title: 'Hướng dẫn nấu phở' }), 'huong dan')).toBe(true);
  });

  it('khớp tất cả token', () => {
    const v = video({ title: 'Hướng dẫn nấu phở' });
    expect(matchesSearch(v, 'huong pho')).toBe(true);
    expect(matchesSearch(v, 'huong banh my')).toBe(false);
  });

  it('khớp theo url', () => {
    expect(matchesSearch(video({ url: 'https://www.facebook.com/watch/?v=1234567890123456' }), '1234567890123456')).toBe(
      true,
    );
  });

  it('khớp theo tag', () => {
    expect(matchesSearch(video({ tags: ['nauan'] }), 'nauan')).toBe(true);
  });

  it('trả true với từ khoá rỗng', () => {
    expect(matchesSearch(video(), '')).toBe(true);
  });
});

describe('inTab', () => {
  it('lọc đúng theo từng tab', () => {
    const inProgress = video({ positionSec: 20, completed: false });
    const done = video({ positionSec: 100, completed: true, percent: 100 });
    const review = video({ positionSec: 0, percent: 0, needsReview: true });

    expect(inTab(inProgress, 'in_progress')).toBe(true);
    expect(inTab(done, 'in_progress')).toBe(false);
    expect(inTab(done, 'completed')).toBe(true);
    expect(inTab(review, 'review')).toBe(true);
    expect(inTab(inProgress, 'all')).toBe(true);
  });
});

describe('sortVideos', () => {
  it('recent: mới nhất trước', () => {
    const a = video({ id: 'a', lastWatchedAt: 1000 });
    const b = video({ id: 'b', lastWatchedAt: 3000 });
    const c = video({ id: 'c', lastWatchedAt: 2000 });
    expect(sortVideos([a, b, c], 'recent').map((v) => v.id)).toEqual(['b', 'c', 'a']);
  });

  it('progress: phần trăm cao trước', () => {
    const a = video({ id: 'a', percent: 10 });
    const b = video({ id: 'b', percent: 80 });
    expect(sortVideos([a, b], 'progress').map((v) => v.id)).toEqual(['b', 'a']);
  });

  it('remaining: còn ít thời gian nhất trước và đẩy thời lượng chưa biết xuống cuối', () => {
    const a = video({ id: 'a', durationSec: 100, positionSec: 90 });
    const b = video({ id: 'b', durationSec: 100, positionSec: 10 });
    const c = video({ id: 'c', durationSec: 0, positionSec: 0 });
    expect(sortVideos([c, b, a], 'remaining').map((v) => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('title: sắp xếp theo tiếng Việt', () => {
    const a = video({ id: 'a', title: 'Bò' });
    const b = video({ id: 'b', title: 'Ăn' });
    const sorted = sortVideos([a, b], 'title');
    expect(sorted[0]?.title).toBe('Ăn');
  });

  it('không thay đổi mảng gốc', () => {
    const list = [video({ id: '1', lastWatchedAt: 1 }), video({ id: '2', lastWatchedAt: 2 })];
    const before = list.map((v) => v.id);
    sortVideos(list, 'recent');
    expect(list.map((v) => v.id)).toEqual(before);
  });
});

describe('filterVideos và filterAndSort', () => {
  it('lọc theo tab rồi theo từ khoá', () => {
    const list = [
      video({ id: 'a', title: 'Nấu phở', positionSec: 20 }),
      video({ id: 'b', title: 'Nấu bún', positionSec: 20 }),
      video({ id: 'c', title: 'Nấu phở', positionSec: 100, completed: true, percent: 100 }),
    ];
    const result = filterVideos(list, { tab: 'in_progress', search: 'pho', sort: 'recent' });
    expect(result.map((v) => v.id)).toEqual(['a']);
  });

  it('trả mảng rỗng khi không khớp', () => {
    expect(filterVideos([video({ title: 'abc' })], { tab: 'review', search: 'zzz', sort: 'recent' })).toEqual([]);
  });

  it('filterAndSort kết hợp cả hai', () => {
    const list = [
      video({ id: 'a', title: 'phở', lastWatchedAt: 1, positionSec: 10 }),
      video({ id: 'b', title: 'phở', lastWatchedAt: 9, positionSec: 10 }),
      video({ id: 'c', title: 'bún', lastWatchedAt: 5, positionSec: 10 }),
    ];
    const result = filterAndSort(list, { tab: 'in_progress', search: 'pho', sort: 'recent' });
    expect(result.map((v) => v.id)).toEqual(['b', 'a']);
  });

  it('DEFAULT_FILTER_STATE hợp lý', () => {
    expect(DEFAULT_FILTER_STATE).toEqual({ tab: 'in_progress', search: '', sort: 'recent' });
  });
});

describe('tabCounts', () => {
  it('đếm đúng từng nhóm', () => {
    const counts = tabCounts([
      video({ id: '1', positionSec: 20 }),
      video({ id: '2', positionSec: 100, completed: true, percent: 100 }),
      video({ id: '3', positionSec: 0, percent: 0, needsReview: true }),
      video({ id: '4', positionSec: 50, needsReview: true }),
    ]);
    expect(counts.all).toBe(4);
    expect(counts.completed).toBe(1);
    expect(counts.review).toBe(2);
    expect(counts.in_progress).toBe(2);
  });

  it('xử lý mảng rỗng', () => {
    expect(tabCounts([])).toEqual({ in_progress: 0, completed: 0, review: 0, all: 0 });
  });
});
