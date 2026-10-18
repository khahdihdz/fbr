import { describe, expect, it } from 'vitest';
import { migrateVideo, isSupportedSchema, upgradeDatabase, DB_NAME, STORE_VIDEOS } from './schema';
import { computePercent } from '../progress/percent';

describe('migrateVideo', () => {
  it('trả null với dữ liệu không dùng được', () => {
    expect(migrateVideo(null)).toBeNull();
    expect(migrateVideo('chuỗi')).toBeNull();
    expect(migrateVideo({})).toBeNull();
    expect(migrateVideo(42)).toBeNull();
  });

  it('đọc bản ghi đã đúng shape', () => {
    const video = migrateVideo({
      id: '1234567890123456',
      url: 'https://www.facebook.com/watch/?v=1234567890123456',
      title: 'Tiêu đề thật',
      source: 'fb_export',
      durationSec: 120,
      positionSec: 30,
      lastWatchedAt: 1_700_000_000_000,
    });
    expect(video).not.toBeNull();
    expect(video?.percent).toBe(25);
    expect(video?.source).toBe('fb_export');
    expect(video?.confidence).toBe('high');
  });

  it('đọc được shape cũ dùng duration_ms và position_ms', () => {
    const video = migrateVideo({
      id: 'abc',
      url: 'https://www.facebook.com/watch/?v=1',
      title: 'Cũ',
      duration_ms: 60_000,
      position_ms: 15_000,
      updated_at: 1_700_000_000_000,
    });
    expect(video?.durationSec).toBe(60);
    expect(video?.positionSec).toBe(15);
    expect(video?.percent).toBe(25);
    expect(video?.lastWatchedAt).toBe(1_700_000_000_000);
    expect(video?.firstSeenAt).toBe(1_700_000_000_000);
  });

  it('kẹp vị trí không vượt thời lượng', () => {
    const video = migrateVideo({ id: 'a', durationSec: 60, positionSec: 600 });
    expect(video?.positionSec).toBe(60);
    expect(video?.completed).toBe(true);
  });

  it('bỏ nguồn không hợp lệ về manual', () => {
    const video = migrateVideo({ id: 'a', source: 'nguồn lạ' });
    expect(video?.source).toBe('manual');
    expect(video?.confidence).toBe('medium');
  });

  it('giữ resolvedBy hợp lệ và hạ giá trị lạ xuống unknown', () => {
    expect(migrateVideo({ id: 'a', resolvedBy: 'shortlink' })?.resolvedBy).toBe('shortlink');
    expect(migrateVideo({ id: 'a', resolvedBy: '???' })?.resolvedBy).toBe('unknown');
  });

  it('dùng url làm id khi thiếu id', () => {
    const video = migrateVideo({ url: 'https://www.facebook.com/watch/?v=42' });
    expect(video?.id).toBe('https://www.facebook.com/watch/?v=42');
  });

  it('lọc tag không phải chuỗi', () => {
    const video = migrateVideo({ id: 'a', tags: ['ok', 5, null, 'fine'] });
    expect(video?.tags).toEqual(['ok', 'fine']);
  });

  it('cắt history còn 50 mục', () => {
    const history = Array.from({ length: 80 }, (_, i) => ({
      at: i,
      field: 'positionSec',
      from: 0,
      to: i,
      source: 'manual',
    }));
    expect(migrateVideo({ id: 'a', history })?.history).toHaveLength(50);
  });

  it('bỏ note rỗng', () => {
    expect(migrateVideo({ id: 'a', note: '   ' })?.note).toBeUndefined();
    expect(migrateVideo({ id: 'a', note: 'ghi chú' })?.note).toBe('ghi chú');
  });

  it('tính percent đúng theo shape cũ', () => {
    const video = migrateVideo({ id: 'a', duration_ms: 10_000, position_ms: 2_500 });
    expect(video?.percent).toBe(computePercent(2.5, 10));
  });

  it('mặc định watchCount tối thiểu 0 và totalWatchedSec theo position', () => {
    const video = migrateVideo({ id: 'a', durationSec: 100, positionSec: 40 });
    expect(video?.watchCount).toBe(1);
    expect(video?.totalWatchedSec).toBe(40);
  });
});

describe('isSupportedSchema', () => {
  it('chấp nhận đúng schema hiện tại', () => {
    expect(isSupportedSchema('fbr.progress.v1')).toBe(true);
    expect(isSupportedSchema('fbr.progress.v0')).toBe(false);
    expect(isSupportedSchema(undefined)).toBe(false);
  });
});

describe('upgradeDatabase', () => {
  it('tạo object store và index khi mới', async () => {
    const { indexedDB } = globalThis;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${DB_NAME}-test-upgrade`, 1);
      request.onupgradeneeded = () => upgradeDatabase(request.result, 0);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    expect([...db.objectStoreNames]).toContain(STORE_VIDEOS);

    const store = db.transaction(STORE_VIDEOS, 'readonly').objectStore(STORE_VIDEOS);
    expect([...store.indexNames]).toContain('lastWatchedAt');
    expect([...store.indexNames]).toContain('completed');
    db.close();
  });

  it('không tạo trùng store khi đã tồn tại', async () => {
    const { indexedDB } = globalThis;
    const name = `${DB_NAME}-test-noop`;
    const first = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => upgradeDatabase(request.result, 0);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    first.close();

    const second = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onupgradeneeded = () => upgradeDatabase(request.result, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect([...second.objectStoreNames]).toHaveLength(2);
    second.close();
  });
});
