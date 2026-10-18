import { describe, expect, it } from 'vitest';
import { VideoRepo } from './repo';
import { createVideoProgress } from '../progress/merge';
import { normalizeVideoId } from '../video/videoId';
import type { VideoProgress } from '../types';

let counter = 0;

async function makeRepo(): Promise<VideoRepo> {
  counter += 1;
  return VideoRepo.open(`fbr-test-${counter}`, 1);
}

function video(id: string, overrides: Partial<VideoProgress> = {}): VideoProgress {
  const base = createVideoProgress({
    ref: normalizeVideoId(`https://www.facebook.com/watch/?v=${id}`),
    source: 'manual',
    now: 1_700_000_000_000,
    title: `Tiêu đề ${id}`,
    durationSec: 100,
    positionSec: 20,
  });
  return { ...base, id, ...overrides };
}

describe('VideoRepo', () => {
  it('lưu và đọc lại một bản ghi', async () => {
    const repo = await makeRepo();
    await repo.put(video('1234567890123456'));
    const found = await repo.get('1234567890123456');
    expect(found?.title).toBe('Tiêu đề 1234567890123456');
    repo.close();
  });

  it('trả undefined khi không tìm thấy', async () => {
    const repo = await makeRepo();
    expect(await repo.get('không tồn tại')).toBeUndefined();
    repo.close();
  });

  it('đếm số bản ghi', async () => {
    const repo = await makeRepo();
    expect(await repo.count()).toBe(0);
    await repo.putMany([video('1'), video('2')]);
    expect(await repo.count()).toBe(2);
    repo.close();
  });

  it('putMany với mảng rỗng không lỗi', async () => {
    const repo = await makeRepo();
    expect(await repo.putMany([])).toBe(0);
    repo.close();
  });

  it('xoá một bản ghi', async () => {
    const repo = await makeRepo();
    await repo.put(video('1'));
    await repo.remove('1');
    expect(await repo.count()).toBe(0);
    repo.close();
  });

  it('xoá toàn bộ', async () => {
    const repo = await makeRepo();
    await repo.putMany([video('1'), video('2'), video('3')]);
    await repo.clear();
    expect(await repo.count()).toBe(0);
    repo.close();
  });

  it('prune giữ lại đúng số lượng mới nhất', async () => {
    const repo = await makeRepo();
    await repo.putMany([
      video('1', { lastWatchedAt: 1000 }),
      video('2', { lastWatchedAt: 2000 }),
      video('3', { lastWatchedAt: 3000 }),
      video('4', { lastWatchedAt: 4000 }),
    ]);
    const result = await repo.prune(2);
    expect(result.removed).toBe(2);
    expect(result.kept).toBe(2);

    const rest = await repo.all();
    expect(rest.map((v) => v.id).sort()).toEqual(['3', '4']);
    repo.close();
  });

  it('prune không làm gì khi dưới ngưỡng', async () => {
    const repo = await makeRepo();
    await repo.put(video('1'));
    const result = await repo.prune(10);
    expect(result.removed).toBe(0);
    expect(result.kept).toBe(1);
    repo.close();
  });

  it('báo số bản ghi vượt ngưỡng', async () => {
    const repo = await makeRepo();
    await repo.putMany([video('1'), video('2'), video('3')]);
    expect(await repo.overflow(2)).toBe(1);
    expect(await repo.overflow(10)).toBe(0);
    repo.close();
  });

  it('lưu và đọc meta', async () => {
    const repo = await makeRepo();
    expect(await repo.getMeta('missing', 'mặc định')).toBe('mặc định');
    await repo.setMeta('lastSync', 12345);
    expect(await repo.getMeta('lastSync', 0)).toBe(12345);
    await repo.removeMeta('lastSync');
    expect(await repo.getMeta('lastSync', 0)).toBe(0);
    repo.close();
  });

  it('other records có shape lạ vẫn đọc được nhờ migrateVideo', async () => {
    const repo = await makeRepo();
    await repo.putMany([
      {
        id: '999',
        url: 'https://www.facebook.com/watch/?v=999',
        duration_ms: 60_000,
        position_ms: 30_000,
      } as unknown as VideoProgress,
    ]);
    const found = await repo.get('999');
    expect(found?.durationSec).toBe(60);
    expect(found?.percent).toBe(50);
    repo.close();
  });
});
