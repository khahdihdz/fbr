/** Nguồn dữ liệu ghi nhận tiến trình. */
export type Source =
  | 'share_target'
  | 'session_estimate'
  | 'manual'
  | 'fb_export'
  | 'link_paste';

/** Độ tin cậy của một bản ghi. Không bao giờ trộn lẫn trong UI. */
export type Confidence = 'high' | 'medium' | 'low';

/** Cách suy ra ID video. */
export type ResolvedBy = 'url' | 'shortlink' | 'hash' | 'unknown';

/** Loại video Facebook. */
export type VideoKind = 'watch' | 'video' | 'reel' | 'short_link' | 'unknown';

/** Tab lọc trên dashboard. */
export type Tab = 'in_progress' | 'completed' | 'review' | 'all';

/** Khoá sắp xếp. */
export type SortKey = 'recent' | 'progress' | 'remaining' | 'title';

/** Một lần thay đổi dữ liệu, phục vụ màn hình chi tiết. */
export interface HistoryEntry {
  at: number;
  field: string;
  from: string | number | null;
  to: string | number | null;
  source: Source;
}

/** Bản ghi tiến trình của một video. */
export interface VideoProgress {
  id: string;
  url: string;
  fbDeepLink?: string;
  title: string;
  source: Source;
  confidence: Confidence;
  resolvedBy: ResolvedBy;
  durationSec: number;
  positionSec: number;
  percent: number;
  completed: boolean;
  watchCount: number;
  totalWatchedSec: number;
  firstSeenAt: number;
  lastWatchedAt: number;
  needsReview: boolean;
  note?: string;
  tags?: string[];
  history?: HistoryEntry[];
}

/** Hợp đồng dữ liệu trao đổi giữa app và web dashboard. */
export interface FbrExport {
  schema: 'fbr.progress.v1';
  exportedAt: number;
  app: 'fbr-web';
  videos: VideoProgress[];
}

/** Kết quả chuẩn hoá một link / chuỗi thành tham chiếu video. */
export interface VideoRef {
  id: string;
  kind: VideoKind;
  resolvedBy: ResolvedBy;
  webUrl: string;
  isNumericId: boolean;
}

export const SCHEMA_ID = 'fbr.progress.v1' as const;
export const APP_ID = 'fbr-web' as const;

export const COMPLETE_THRESHOLD = 95;
export const MAX_RECORDS = 10_000;
export const MAX_SESSION_MS = 4 * 60 * 60 * 1000;
export const MIN_SESSION_MS = 5_000;
export const HISTORY_LIMIT = 50;
