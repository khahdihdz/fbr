import { describe, expect, it } from 'vitest';
import {
  consumePendingShare,
  readShareFromLocation,
  refFromShare,
  savePendingShare,
  SHARE_KEY,
  type SessionStorageLike,
} from './shareTarget';

function memoryStorage(initial: Record<string, string> = {}): SessionStorageLike & { dump(): Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
    dump: () => ({ ...data }),
  };
}

describe('readShareFromLocation', () => {
  it('đọc đủ ba tham số', () => {
    const payload = readShareFromLocation(
      '?url=https%3A%2F%2Fwww.facebook.com%2Fwatch%2F%3Fv%3D1234567890123456&text=xin%20ch%C3%A0o&title=Video',
    );
    expect(payload?.url).toBe('https://www.facebook.com/watch/?v=1234567890123456');
    expect(payload?.text).toBe('xin chào');
    expect(payload?.title).toBe('Video');
  });

  it('chấp nhận chuỗi không có dấu ?', () => {
    expect(readShareFromLocation('url=https://fb.watch/abc/')?.url).toBe('https://fb.watch/abc/');
  });

  it('trả null khi không có tham số nào', () => {
    expect(readShareFromLocation('')).toBeNull();
    expect(readShareFromLocation('?foo=bar')).toBeNull();
  });
});

describe('pending share trong sessionStorage', () => {
  it('lưu rồi đọc lại và xoá', () => {
    const storage = memoryStorage();
    savePendingShare(storage, {
      url: 'https://www.facebook.com/watch/?v=1234567890123456',
      text: '',
      title: 'A',
      receivedAt: 1,
    });
    expect(storage.getItem(SHARE_KEY)).not.toBeNull();

    const payload = consumePendingShare(storage);
    expect(payload?.url).toBe('https://www.facebook.com/watch/?v=1234567890123456');
    expect(storage.getItem(SHARE_KEY)).toBeNull();
  });

  it('trả null khi không có gì', () => {
    expect(consumePendingShare(memoryStorage())).toBeNull();
  });

  it('trả null với JSON hỏng và vẫn xoá khoá', () => {
    const storage = memoryStorage({ [SHARE_KEY]: '{ hỏng' });
    expect(consumePendingShare(storage)).toBeNull();
    expect(storage.getItem(SHARE_KEY)).toBeNull();
  });

  it('chuẩn hoá giá trị thiếu', () => {
    const storage = memoryStorage({ [SHARE_KEY]: JSON.stringify({ url: 'https://fb.watch/x/' }) });
    const payload = consumePendingShare(storage);
    expect(payload?.text).toBe('');
    expect(payload?.title).toBe('');
    expect(payload?.receivedAt).toBeGreaterThan(0);
  });
});

describe('refFromShare', () => {
  it('ưu tiên tham số url', () => {
    const ref = refFromShare({
      url: 'https://www.facebook.com/watch/?v=1111111111111111',
      text: 'https://www.facebook.com/watch/?v=2222222222222222',
      title: '',
      receivedAt: 0,
    });
    expect(ref?.id).toBe('1111111111111111');
  });

  it('quét text khi url rỗng', () => {
    const ref = refFromShare({
      url: '',
      text: 'Xem cái này https://www.facebook.com/reel/2222222222222222/ hay lắm',
      title: '',
      receivedAt: 0,
    });
    expect(ref?.id).toBe('2222222222222222');
    expect(ref?.kind).toBe('reel');
  });

  it('quét title khi chỉ có title là link', () => {
    const ref = refFromShare({
      url: '',
      text: '',
      title: 'https://fb.watch/abc123/',
      receivedAt: 0,
    });
    expect(ref?.id).toBe('fbwatch:abc123');
  });

  it('dựng ref từ tiêu đề thuần khi không có link', () => {
    const ref = refFromShare({ url: '', text: '', title: 'Video nấu ăn', receivedAt: 0 });
    expect(ref?.id).toMatch(/^hash:/);
    expect(ref?.resolvedBy).toBe('hash');
  });

  it('trả null khi không có gì dùng được', () => {
    expect(refFromShare({ url: '', text: '', title: '', receivedAt: 0 })).toBeNull();
  });
});
