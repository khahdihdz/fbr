import { normalizeVideoId } from '../video/videoId';
import type { VideoRef } from '../types';
import { createVideoProgress } from '../progress/merge';
import type { VideoProgress } from '../types';

export interface ParsedUrlList {
  refs: VideoRef[];
  skipped: string[];
  duplicates: number;
}

/**
 * Phân tích danh sách link người dùng dán vào (mỗi dòng một link, hoặc văn bản
 * lẫn nhiều link). Bỏ qua dòng không phải link Facebook.
 */
export function parseUrlList(text: string): ParsedUrlList {
  const refs: VideoRef[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let matched = 0;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const raw = line.trim();
    if (!raw) continue;
    const ref = normalizeVideoId(raw);
    if (ref.kind === 'unknown') {
      skipped.push(raw);
      continue;
    }
    matched += 1;
    if (seen.has(ref.id)) {
      duplicates += 1;
      continue;
    }
    seen.add(ref.id);
    refs.push(ref);
  }

  if (matched === 0 && refs.length === 0) {
    for (const line of lines) {
      const raw = line.trim();
      if (raw && !skipped.includes(raw)) skipped.push(raw);
    }
  }

  return { refs, skipped, duplicates };
}

export interface ConvertOptions {
  now: number;
  source?: VideoProgress['source'];
  tags?: string[];
}

/** Chuyển danh sách tham chiếu thành bản ghi có thể lưu. */
export function refsToVideos(refs: VideoRef[], options: ConvertOptions): VideoProgress[] {
  const source = options.source ?? 'link_paste';
  return refs.map((ref) =>
    createVideoProgress({
      ref,
      source,
      now: options.now,
      tags: options.tags,
      needsReview: true,
    }),
  );
}

/** Tiện ích một phát: dán link hàng loạt. */
export function videosFromUrlText(text: string, options: ConvertOptions): {
  videos: VideoProgress[];
  skipped: string[];
  duplicates: number;
} {
  const parsed = parseUrlList(text);
  return {
    videos: refsToVideos(parsed.refs, options),
    skipped: parsed.skipped,
    duplicates: parsed.duplicates,
  };
}
