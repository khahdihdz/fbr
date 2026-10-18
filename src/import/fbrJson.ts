import { APP_ID, SCHEMA_ID, type FbrExport, type VideoProgress } from '../types';
import { migrateVideo } from '../db/schema';

export interface ParseResult<T> {
  ok: boolean;
  errors: string[];
  warnings: string[];
  value: T;
}

export function buildFbrExport(videos: VideoProgress[], now: number): FbrExport {
  return {
    schema: SCHEMA_ID,
    exportedAt: now,
    app: APP_ID,
    videos: videos.map((video) => ({ ...video })),
  };
}

export function serializeFbrExport(videos: VideoProgress[], now: number): string {
  return `${JSON.stringify(buildFbrExport(videos, now), null, 2)}\n`;
}

/** CSV để mở bằng bảng tính. */
export function serializeCsv(videos: VideoProgress[]): string {
  const header = [
    'id',
    'title',
    'url',
    'source',
    'confidence',
    'durationSec',
    'positionSec',
    'percent',
    'completed',
    'watchCount',
    'totalWatchedSec',
    'firstSeenAt',
    'lastWatchedAt',
    'tags',
    'note',
  ];
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = videos.map((video) =>
    [
      video.id,
      video.title,
      video.url,
      video.source,
      video.confidence,
      video.durationSec,
      video.positionSec,
      video.percent,
      video.completed,
      video.watchCount,
      video.totalWatchedSec,
      video.firstSeenAt,
      video.lastWatchedAt,
      (video.tags ?? []).join('|'),
      video.note ?? '',
    ]
      .map(escape)
      .join(','),
  );
  return `${[header.join(','), ...rows].join('\n')}\n`;
}

/** Phân tích object đã parse thành danh sách bản ghi. */
export function parseFbrExportObject(input: unknown): ParseResult<VideoProgress[]> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const value: VideoProgress[] = [];

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['File không phải object JSON.'], warnings, value };
  }

  const record = input as Record<string, unknown>;
  if (record['schema'] !== SCHEMA_ID) {
    return {
      ok: false,
      errors: [`Schema không hỗ trợ: ${String(record['schema'] ?? '(thiếu)')}. Cần ${SCHEMA_ID}.`],
      warnings,
      value,
    };
  }

  const rawVideos = record['videos'];
  if (!Array.isArray(rawVideos)) {
    return { ok: false, errors: ['Trường "videos" không phải mảng.'], warnings, value };
  }

  let invalid = 0;
  for (const raw of rawVideos) {
    const video = migrateVideo(raw);
    if (video) value.push(video);
    else invalid += 1;
  }
  if (invalid > 0) warnings.push(`Bỏ qua ${invalid} bản ghi không hợp lệ.`);
  if (value.length === 0) warnings.push('Không có bản ghi nào đọc được.');

  return { ok: true, errors, warnings, value };
}

/** Phân tích chuỗi JSON export. */
export function parseFbrExport(text: string): ParseResult<VideoProgress[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'lỗi không xác định';
    return { ok: false, errors: [`JSON không hợp lệ: ${message}`], warnings: [], value: [] };
  }
  return parseFbrExportObject(parsed);
}
