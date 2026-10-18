import type { Confidence, Source } from '../types';

const CONFIDENCE_BY_SOURCE: Record<Source, Confidence> = {
  fb_export: 'high',
  manual: 'medium',
  share_target: 'low',
  session_estimate: 'low',
  link_paste: 'low',
};

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

export function confidenceForSource(source: Source): Confidence {
  return CONFIDENCE_BY_SOURCE[source];
}

export function confidenceRank(confidence: Confidence): number {
  return RANK[confidence];
}

const SOURCE_LABEL: Record<Source, string> = {
  fb_export: 'Từ Facebook export',
  manual: 'Thủ công',
  share_target: 'Từ chia sẻ',
  session_estimate: 'Ước tính',
  link_paste: 'Từ link dán',
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'chính xác',
  medium: 'khá chắc',
  low: 'ước lượng',
};

export function describeSource(source: Source): string {
  return SOURCE_LABEL[source] ?? 'Không rõ';
}

export function describeConfidence(confidence: Confidence): string {
  return CONFIDENCE_LABEL[confidence] ?? 'không rõ';
}

/** Tiêu đề tự sinh, không phải tiêu đề thật của video. */
export function isPlaceholderTitle(title: string | undefined): boolean {
  if (!title) return true;
  const clean = title.trim();
  if (!clean) return true;
  if (/^(video|reel)\s+(\d{6,}|hash:[0-9a-f]{1,8}|fbwatch:.+|share:.+)$/i.test(clean)) return true;
  if (/^(facebook video|fb video)\s*$/i.test(clean)) return true;
  return false;
}
