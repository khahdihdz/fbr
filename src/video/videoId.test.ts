import { describe, expect, it } from 'vitest';
import fixtures from '../../shared/fixtures/video-urls.json';
import {
  extractAllUrls,
  inferKind,
  normalizeVideoId,
  stableHash,
  stripTrackingParams,
  thumbnailUrlForId,
} from './videoId';
import { deepLinkCandidates, httpFallback } from './deepLink';

interface FixtureCase {
  name: string;
  input: string;
  expectedId?: string;
  expectedKind: string;
  expectedResolvedBy: string;
}

const cases = fixtures.cases as FixtureCase[];

describe('normalizeVideoId với fixture dùng chung', () => {
  it('có ít nhất 20 fixture', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  for (const fixture of cases) {
    it(`${fixture.name}: ${fixture.input}`, () => {
      const ref = normalizeVideoId(fixture.input);
      expect(ref.kind).toBe(fixture.expectedKind);
      expect(ref.resolvedBy).toBe(fixture.expectedResolvedBy);
      if (fixture.expectedId) expect(ref.id).toBe(fixture.expectedId);
    });
  }
});

describe('stableHash', () => {
  it('ổn định và luôn 8 ký tự hex', () => {
    const first = stableHash('https://www.facebook.com/watch/?v=1');
    const second = stableHash('https://www.facebook.com/watch/?v=1');
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}$/);
  });

  it('khác nhau với đầu vào khác nhau', () => {
    expect(stableHash('a')).not.toBe(stableHash('b'));
  });
});

describe('extractAllUrls', () => {
  it('lấy đúng số link trong đoạn văn', () => {
    const urls = extractAllUrls(fixtures.multiUrlText);
    expect(urls).toHaveLength(fixtures.expectedMultiUrlCount);
    expect(urls[0]).toContain('watch/?v=1234567890123456');
    expect(urls[1]).toContain('fb.watch/xyz789');
  });

  it('trả về mảng rỗng khi không có link', () => {
    expect(extractAllUrls('không có gì ở đây')).toEqual([]);
  });
});

describe('stripTrackingParams', () => {
  it('bỏ tham số tracking nhưng giữ v', () => {
    const cleaned = stripTrackingParams(
      'https://www.facebook.com/watch/?v=123&ref=share&mibextid=x&sfnsn=mo&keep=1',
    );
    expect(cleaned).toContain('v=123');
    expect(cleaned).toContain('keep=1');
    expect(cleaned).not.toContain('ref=');
    expect(cleaned).not.toContain('mibextid=');
    expect(cleaned).not.toContain('sfnsn=');
  });

  it('trả nguyên chuỗi khi không parse được', () => {
    expect(stripTrackingParams('không phải url')).toBe('không phải url');
  });
});

describe('inferKind', () => {
  it('nhận ra reel qua url', () => {
    expect(inferKind('1234567890123456', 'https://www.facebook.com/reel/1234567890123456/', 'url')).toBe('reel');
  });

  it('nhận ra link rút gọn', () => {
    expect(inferKind('fbwatch:abc', 'https://fb.watch/abc/', 'shortlink')).toBe('short_link');
    expect(inferKind('share:v:abc', '', 'shortlink')).toBe('short_link');
  });

  it('trả unknown khi hash', () => {
    expect(inferKind('hash:deadbeef', '', 'hash')).toBe('unknown');
  });

  it('mặc định là watch với ID số', () => {
    expect(inferKind('1234567890123456', 'https://www.facebook.com/watch/?v=1234567890123456', 'url')).toBe('watch');
  });
});

describe('thumbnailUrlForId', () => {
  it('chỉ trả ảnh cho ID số', () => {
    expect(thumbnailUrlForId('1234567890123456')).toContain('graph.facebook.com/1234567890123456/picture');
    expect(thumbnailUrlForId('fbwatch:abc')).toBeNull();
  });
});

describe('deep link', () => {
  it('sinh nhiều ứng viên cho watch và luôn có thứ tự ổn định', () => {
    const candidates = deepLinkCandidates('1234567890123456', 'watch');
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates[0]).toBe('fb://watch/?v=1234567890123456');
  });

  it('không sinh deep link cho ID không phải số', () => {
    expect(deepLinkCandidates('fbwatch:abc', 'watch')).toEqual([]);
  });

  it('reel có deep link riêng', () => {
    expect(deepLinkCandidates('999', 'reel')[0]).toBe('fb://reel/999');
  });

  it('fallback http dùng url gốc khi có', () => {
    expect(httpFallback({ id: '123', kind: 'watch', webUrl: 'https://example.com/x' })).toBe(
      'https://example.com/x',
    );
  });

  it('fallback http dựng url watch khi thiếu', () => {
    expect(httpFallback({ id: '1234567890123456', kind: 'watch', webUrl: '' })).toBe(
      'https://www.facebook.com/watch/?v=1234567890123456',
    );
  });

  it('fallback cho short_link không có url sẽ về trang watch', () => {
    expect(httpFallback({ id: 'fbwatch:abc', kind: 'short_link', webUrl: '' })).toBe(
      'https://www.facebook.com/watch/',
    );
  });
});
