import { describe, expect, it } from 'vitest';
import { dyiItemToVideo, findWatchHistoryCandidates, parseDyi } from './fbDyi';

const NOW = 1_700_000_000_000;

describe('findWatchHistoryCandidates', () => {
  it('tìm thấy mảng watch history lồng sâu', () => {
    const root = {
      your_activity_across_facebook: {
        your_video_watch_history: [
          { title: 'Video A', uri: 'https://www.facebook.com/watch/?v=1111111111111111', timestamp: 1_700_000_000 },
          { title: 'Video B', uri: 'https://www.facebook.com/watch/?v=2222222222222222', timestamp: 1_700_000_100 },
        ],
      },
    };
    const candidates = findWatchHistoryCandidates(root);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0]?.key).toBe('your_video_watch_history');
    expect(candidates[0]?.items).toHaveLength(2);
  });

  it('trả rỗng với dữ liệu không liên quan', () => {
    const candidates = findWatchHistoryCandidates({ foo: { bar: [1, 2, 3] } });
    expect(candidates).toEqual([]);
  });

  it('bỏ qua mảng label_values', () => {
    const candidates = findWatchHistoryCandidates({
      metadata: { label_values: [{ label: 'Video', value: 'x' }] },
    });
    expect(candidates).toEqual([]);
  });

  it('xếp hạng mảng có tên chứa video lên trước', () => {
    const root = {
      other_stuff: [{ title: 'A', uri: 'https://x' }],
      watched_videos: [
        { title: 'B', uri: 'https://y' },
        { title: 'C', uri: 'https://z' },
      ],
    };
    const candidates = findWatchHistoryCandidates(root);
    expect(candidates[0]?.key).toBe('watched_videos');
  });

  it('giới hạn số ứng viên trả về', () => {
    const items = [{ title: 'A', uri: 'https://x' }, { title: 'B', uri: 'https://y' }];
    const root = {
      videos_a: items,
      videos_b: items,
      videos_c: items,
      videos_d: items,
    };
    expect(findWatchHistoryCandidates(root, 2)).toHaveLength(2);
  });
});

describe('dyiItemToVideo', () => {
  it('đọc title + uri dạng chuẩn', () => {
    const video = dyiItemToVideo(
      { title: 'Hướng dẫn', uri: 'https://www.facebook.com/watch/?v=1234567890123456', timestamp: 1_700_000_000 },
      NOW,
    );
    expect(video?.id).toBe('1234567890123456');
    expect(video?.source).toBe('fb_export');
    expect(video?.confidence).toBe('high');
    expect(video?.lastWatchedAt).toBe(1_700_000_000_000);
    expect(video?.needsReview).toBe(true);
    expect(video?.tags).toContain('fb_export');
  });

  it('đọc qua label_values', () => {
    const video = dyiItemToVideo(
      {
        label_values: [
          { label: 'Title', value: 'Tiêu đề từ nhãn' },
          { label: 'URL', value: 'https://www.facebook.com/reel/9999999999999999/' },
        ],
        timestamp: 1_700_000_000,
      },
      NOW,
    );
    expect(video?.title).toBe('Tiêu đề từ nhãn');
    expect(video?.id).toBe('9999999999999999');
  });

  it('trả null khi thiếu cả title lẫn url', () => {
    expect(dyiItemToVideo({ timestamp: 1 }, NOW)).toBeNull();
    expect(dyiItemToVideo({}, NOW)).toBeNull();
  });

  it('dùng hash khi url không phải Facebook', () => {
    const video = dyiItemToVideo({ title: 'Video ngoài', uri: 'https://youtube.com/watch?v=1' }, NOW);
    expect(video?.resolvedBy).toBe('unknown');
    expect(video?.needsReview).toBe(true);
  });

  it('hiểu timestamp dạng chuỗi ISO', () => {
    const video = dyiItemToVideo(
      { title: 'A', uri: 'https://www.facebook.com/watch/?v=1234567890123456', timestamp: '2026-03-15T12:00:00.000Z' },
      NOW,
    );
    expect(video?.lastWatchedAt).toBe(Date.parse('2026-03-15T12:00:00.000Z'));
  });

  it('đọc timestamp lồng trong metadata', () => {
    const video = dyiItemToVideo(
      { title: 'A', uri: 'https://www.facebook.com/watch/?v=1234567890123456', metadata: { timestamp: 1_700_000_000 } },
      NOW,
    );
    expect(video?.lastWatchedAt).toBe(1_700_000_000_000);
  });

  it('không đặt completed vì export chỉ cho biết đã từng xem', () => {
    const video = dyiItemToVideo({ title: 'A', uri: 'https://www.facebook.com/watch/?v=1234567890123456' }, NOW);
    expect(video?.completed).toBe(false);
    expect(video?.positionSec).toBe(0);
  });
});

describe('parseDyi', () => {
  it('báo lỗi rõ ràng khi không nhận diện được và không trả dữ liệu', () => {
    const result = parseDyi({ nothing: true }, { now: NOW });
    expect(result.ok).toBe(false);
    expect(result.value).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('báo lỗi với JSON hỏng', () => {
    const result = parseDyi('{ hỏng', { now: NOW });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('JSON không hợp lệ');
  });

  it('gộp nhiều file và loại bỏ id trùng', () => {
    const result = parseDyi(
      {
        videos_watched: [
          { title: 'A', uri: 'https://www.facebook.com/watch/?v=1111111111111111' },
          { title: 'A lần 2', uri: 'https://www.facebook.com/watch/?v=1111111111111111' },
          { title: 'B', uri: 'https://www.facebook.com/watch/?v=2222222222222222' },
        ],
      },
      { now: NOW },
    );
    expect(result.ok).toBe(true);
    expect(result.value).toHaveLength(2);
  });

  it('cảnh báo khi tìm thấy nhiều nhóm ứng viên', () => {
    const items = [{ title: 'A', uri: 'https://www.facebook.com/watch/?v=1111111111111111' }];
    const result = parseDyi({ videos_a: items, videos_b: items }, { now: NOW });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('nhóm dữ liệu'))).toBe(true);
  });

  it('lọc theo path khi được chỉ định', () => {
    const result = parseDyi(
      {
        videos_a: [{ title: 'A', uri: 'https://www.facebook.com/watch/?v=1111111111111111' }],
        videos_b: [{ title: 'B', uri: 'https://www.facebook.com/watch/?v=2222222222222222' }],
      },
      { now: NOW, path: 'videos_b' },
    );
    expect(result.ok).toBe(true);
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.id).toBe('2222222222222222');
  });

  it('trả ok=false khi có ứng viên nhưng không mục nào dùng được', () => {
    const result = parseDyi({ videos_watched: [{ foo: 'bar' }, { baz: 1 }] }, { now: NOW });
    expect(result.ok).toBe(false);
  });
});
