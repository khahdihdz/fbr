import { describe, expect, it } from 'vitest';
import {
  DEV_VERSION,
  describeVersion,
  isUpdateAvailable,
  parseVersionInfo,
  pickUpdate,
  sanitizeVersion,
  shortVersion,
  versionFileUrl,
} from './version';

describe('sanitizeVersion', () => {
  it('giữ chuỗi phiên bản hợp lệ', () => {
    expect(sanitizeVersion('abc1234')).toBe('abc1234');
    expect(sanitizeVersion('  796f347169bf  ')).toBe('796f347169bf');
  });

  it('coi token chưa thay và chuỗi rỗng là bản dev', () => {
    expect(sanitizeVersion('__FBR_VERSION__')).toBe(DEV_VERSION);
    expect(sanitizeVersion('')).toBe(DEV_VERSION);
    expect(sanitizeVersion(null)).toBe(DEV_VERSION);
    expect(sanitizeVersion(undefined)).toBe(DEV_VERSION);
  });
});

describe('parseVersionInfo', () => {
  it('đọc đầy đủ các trường', () => {
    const info = parseVersionInfo(
      JSON.stringify({
        version: 'abc1234',
        commit: 'abc1234deadbeef',
        builtAt: '2026-10-18T17:36:34Z',
        content: '796f347169bf',
        run: '42',
      }),
    );
    expect(info).not.toBeNull();
    expect(info?.version).toBe('abc1234');
    expect(info?.commit).toBe('abc1234deadbeef');
    expect(info?.run).toBe('42');
  });

  it('chỉ cần trường version là đủ', () => {
    const info = parseVersionInfo('{"version":"abc1234"}');
    expect(info?.version).toBe('abc1234');
    expect(info?.commit).toBeNull();
    expect(info?.builtAt).toBeNull();
  });

  it('trả null với dữ liệu không dùng được', () => {
    expect(parseVersionInfo('')).toBeNull();
    expect(parseVersionInfo('   ')).toBeNull();
    expect(parseVersionInfo('không phải json')).toBeNull();
    expect(parseVersionInfo('[1,2,3]')).toBeNull();
    expect(parseVersionInfo('null')).toBeNull();
    expect(parseVersionInfo('{"commit":"abc"}')).toBeNull();
    expect(parseVersionInfo('{"version":"   "}')).toBeNull();
  });
});

describe('isUpdateAvailable', () => {
  it('phát hiện khi máy chủ có phiên bản khác', () => {
    expect(isUpdateAvailable({ version: 'newsha1' }, 'oldsha1')).toBe(true);
  });

  it('không báo khi trùng phiên bản', () => {
    expect(isUpdateAvailable({ version: 'same' }, 'same')).toBe(false);
  });

  it('không báo khi thiếu dữ liệu phía máy chủ', () => {
    expect(isUpdateAvailable(null, 'oldsha1')).toBe(false);
    expect(isUpdateAvailable(undefined, 'oldsha1')).toBe(false);
    expect(isUpdateAvailable({ version: '   ' }, 'oldsha1')).toBe(false);
  });

  it('không báo khi một trong hai bên là bản dev', () => {
    expect(isUpdateAvailable({ version: 'abc1234' }, DEV_VERSION)).toBe(false);
    expect(isUpdateAvailable({ version: DEV_VERSION }, 'abc1234')).toBe(false);
    expect(isUpdateAvailable({ version: 'abc1234' }, '')).toBe(false);
  });
});

describe('pickUpdate', () => {
  it('chọn nguồn đầu tiên báo có bản mới', () => {
    const fromFile = { version: 'newsha1' };
    const fromWorker = { version: 'newsha2' };
    expect(pickUpdate('oldsha', [null, fromFile, fromWorker])).toEqual(fromFile);
  });

  it('trả null khi mọi nguồn đều trùng hoặc rỗng', () => {
    expect(pickUpdate('same', [null, undefined, { version: 'same' }])).toBeNull();
  });
});

describe('shortVersion', () => {
  it('cắt bớt chuỗi dài', () => {
    expect(shortVersion('796f347169bf1234')).toBe('796f347169bf');
  });

  it('giữ nguyên chuỗi ngắn', () => {
    expect(shortVersion('abc1234')).toBe('abc1234');
    expect(shortVersion('')).toBe(DEV_VERSION);
  });
});

describe('describeVersion', () => {
  it('ghép phiên bản và commit', () => {
    expect(describeVersion({ version: 'abc1234', commit: 'abc1234deadbeef' })).toBe('abc1234');
    expect(describeVersion({ version: 'abc1234', commit: 'ffffffffffff' })).toBe('abc1234 · commit ffffffffffff');
  });

  it('xử lý giá trị rỗng', () => {
    expect(describeVersion(null)).toBe('không rõ');
    expect(describeVersion({ version: 'abc1234' })).toBe('abc1234');
  });
});

describe('versionFileUrl', () => {
  it('ghép base có hoặc không có dấu / cuối', () => {
    expect(versionFileUrl('/fbr/')).toBe('/fbr/version.json');
    expect(versionFileUrl('/fbr')).toBe('/fbr/version.json');
  });

  it('thêm tham số chống cache', () => {
    expect(versionFileUrl('/fbr/', 123)).toBe('/fbr/version.json?t=123');
    expect(versionFileUrl('/fbr/', '')).toBe('/fbr/version.json');
  });
});
