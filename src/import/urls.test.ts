import { describe, expect, it } from 'vitest';
import { parseUrlList, refsToVideos, videosFromUrlText } from './urls';

const NOW = 1_700_000_000_000;

describe('parseUrlList', () => {
  it('đọc nhiều link mỗi dòng một link', () => {
    const result = parseUrlList(
      [
        'https://www.facebook.com/watch/?v=1111111111111111',
        'https://www.facebook.com/reel/2222222222222222/',
        'https://fb.watch/abc/',
      ].join('\n'),
    );
    expect(result.refs).toHaveLength(3);
    expect(result.skipped).toEqual([]);
  });

  it('bỏ qua dòng trống và khoảng trắng', () => {
    const result = parseUrlList('\n\n   \nhttps://www.facebook.com/watch/?v=1111111111111111\n\n');
    expect(result.refs).toHaveLength(1);
  });

  it('báo các link trùng', () => {
    const result = parseUrlList(
      ['https://www.facebook.com/watch/?v=1111111111111111', 'https://www.facebook.com/watch/?v=1111111111111111'].join(
        '\n',
      ),
    );
    expect(result.refs).toHaveLength(1);
    expect(result.duplicates).toBe(1);
  });

  it('đưa dòng không nhận diện được vào skipped', () => {
    const result = parseUrlList(['https://example.com/video', 'không phải link'].join('\n'));
    expect(result.refs).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
  });

  it('trộn lẫn link hợp lệ và không hợp lệ', () => {
    const result = parseUrlList(
      ['https://example.com/video', 'https://www.facebook.com/watch/?v=1111111111111111'].join('\n'),
    );
    expect(result.refs).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it('lấy link trong một dòng chứa cả văn bản', () => {
    const result = parseUrlList('Xem thử cái này https://www.facebook.com/watch/?v=1111111111111111 nhé');
    expect(result.refs[0]?.id).toBe('1111111111111111');
  });
});

describe('refsToVideos', () => {
  it('gán nguồn mặc định là link_paste', () => {
    const videos = refsToVideos(
      parseUrlList('https://www.facebook.com/watch/?v=1111111111111111').refs,
      { now: NOW },
    );
    expect(videos[0]?.source).toBe('link_paste');
    expect(videos[0]?.confidence).toBe('low');
    expect(videos[0]?.needsReview).toBe(true);
  });

  it('cho phép đổi nguồn và tag', () => {
    const videos = refsToVideos(
      parseUrlList('https://www.facebook.com/watch/?v=1111111111111111').refs,
      { now: NOW, source: 'manual', tags: ['x'] },
    );
    expect(videos[0]?.source).toBe('manual');
    expect(videos[0]?.tags).toEqual(['x']);
  });
});

describe('videosFromUrlText', () => {
  it('trả về cả video lẫn thông tin bỏ qua', () => {
    const result = videosFromUrlText(
      ['https://www.facebook.com/watch/?v=1111111111111111', 'https://example.com/x'].join('\n'),
      { now: NOW },
    );
    expect(result.videos).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it('trả rỗng với đầu vào rỗng', () => {
    const result = videosFromUrlText('   ', { now: NOW });
    expect(result.videos).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});
