import { MAX_RECORDS, type VideoProgress } from '../types';
import { openDatabase, promisifyRequest, txDone } from './idb';
import {
  DB_NAME,
  DB_VERSION,
  STORE_META,
  STORE_VIDEOS,
  migrateVideo,
  upgradeDatabase,
} from './schema';

export interface PruneResult {
  removed: number;
  kept: number;
}

export interface RepoStats {
  count: number;
  bytes: number;
}

/**
 * Lớp truy cập IndexedDB. Chỉ làm nhiệm vụ lưu trữ; mọi logic lọc/sắp xếp
 * nằm ở `src/ui/filters.ts` để có thể kiểm thử độc lập.
 */
export class VideoRepo {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(name: string = DB_NAME, version: number = DB_VERSION): Promise<VideoRepo> {
    const db = await openDatabase(name, version, (database, oldVersion) => {
      upgradeDatabase(database, oldVersion);
    });
    return new VideoRepo(db);
  }

  close(): void {
    this.db.close();
  }

  async all(): Promise<VideoProgress[]> {
    const tx = this.db.transaction(STORE_VIDEOS, 'readonly');
    const result = await promisifyRequest<unknown[]>(tx.objectStore(STORE_VIDEOS).getAll());
    await txDone(tx);
    const videos: VideoProgress[] = [];
    for (const raw of result) {
      const video = migrateVideo(raw);
      if (video) videos.push(video);
    }
    return videos;
  }

  async get(id: string): Promise<VideoProgress | undefined> {
    const tx = this.db.transaction(STORE_VIDEOS, 'readonly');
    const raw = await promisifyRequest<unknown>(tx.objectStore(STORE_VIDEOS).get(id));
    await txDone(tx);
    if (raw === undefined || raw === null) return undefined;
    return migrateVideo(raw) ?? undefined;
  }

  async count(): Promise<number> {
    const tx = this.db.transaction(STORE_VIDEOS, 'readonly');
    const total = await promisifyRequest<number>(tx.objectStore(STORE_VIDEOS).count());
    await txDone(tx);
    return total;
  }

  async put(video: VideoProgress): Promise<void> {
    const tx = this.db.transaction(STORE_VIDEOS, 'readwrite');
    tx.objectStore(STORE_VIDEOS).put(video);
    await txDone(tx);
  }

  async putMany(videos: VideoProgress[]): Promise<number> {
    if (videos.length === 0) return 0;
    const tx = this.db.transaction(STORE_VIDEOS, 'readwrite');
    const store = tx.objectStore(STORE_VIDEOS);
    for (const video of videos) store.put(video);
    await txDone(tx);
    return videos.length;
  }

  async remove(id: string): Promise<void> {
    const tx = this.db.transaction(STORE_VIDEOS, 'readwrite');
    tx.objectStore(STORE_VIDEOS).delete(id);
    await txDone(tx);
  }

  async clear(): Promise<void> {
    const tx = this.db.transaction(STORE_VIDEOS, 'readwrite');
    tx.objectStore(STORE_VIDEOS).clear();
    await txDone(tx);
  }

  /**
   * Giữ tối đa `max` bản ghi, xoá những bản có lastWatchedAt cũ nhất.
   * Trả về số bản ghi đã xoá để UI có thể báo cho người dùng.
   */
  async prune(max: number = MAX_RECORDS): Promise<PruneResult> {
    const videos = await this.all();
    if (videos.length <= max) return { removed: 0, kept: videos.length };

    const sorted = [...videos].sort((a, b) => a.lastWatchedAt - b.lastWatchedAt);
    const toRemove = sorted.slice(0, videos.length - max);
    const ids = toRemove.map((video) => video.id);

    const tx = this.db.transaction(STORE_VIDEOS, 'readwrite');
    const store = tx.objectStore(STORE_VIDEOS);
    for (const id of ids) store.delete(id);
    await txDone(tx);

    return { removed: ids.length, kept: max };
  }

  /** Số bản ghi vượt ngưỡng, dùng để cảnh báo trước khi xoá. */
  async overflow(max: number = MAX_RECORDS): Promise<number> {
    const total = await this.count();
    return Math.max(0, total - max);
  }

  async getMeta<T>(key: string, fallback: T): Promise<T> {
    const tx = this.db.transaction(STORE_META, 'readonly');
    const raw = await promisifyRequest<unknown>(tx.objectStore(STORE_META).get(key));
    await txDone(tx);
    return raw === undefined || raw === null ? fallback : (raw as T);
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put(value, key);
    await txDone(tx);
  }

  async removeMeta(key: string): Promise<void> {
    const tx = this.db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).delete(key);
    await txDone(tx);
  }
}
