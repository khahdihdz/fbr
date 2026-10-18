import type { ResolvedBy, VideoKind, VideoRef } from '../types';

/**
 * Trích URL Facebook đầu tiên trong một chuỗi bất kỳ.
 * Chấp nhận cả trường hợp thiếu scheme (facebook.com/...).
 */
const URL_RE =
  /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:facebook\.com|fb\.watch|fb\.gg)\/[^\s<>"'`()[\]]*/gi;

const FB_DOMAIN_RE = /(?:facebook\.com|fb\.watch|fb\.gg)/i;

const TRACKING_PARAMS = new Set([
  '__cft__',
  '__tn__',
  '__eep__',
  '_rdr',
  '_fb_noscript',
  'acontext',
  'ah',
  'checkpoint_src',
  'eav',
  'eid',
  'extid',
  'fref',
  'hc_ref',
  'hsi',
  'locale',
  'locale2',
  'lst',
  'm_ttl',
  'mi_source',
  'mibextid',
  'notif_id',
  'notif_t',
  'paipv',
  'rdr',
  'ref',
  'refsrc',
  'sfnsn',
  'comment_id',
  'ftentidentifier',
]);

const NUMERIC_ID_RE = /^\d{6,25}$/;

/** Hash FNV-1a 32 bit, ổn định, không phụ thuộc crypto. */
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function trimTrailing(raw: string): string {
  return raw.replace(/[.,;:!?'")\]}>]+$/g, '');
}

export function extractAllUrls(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  const re = new RegExp(URL_RE.source, 'gi');
  let match = re.exec(text);
  while (match) {
    const cleaned = trimTrailing(match[0]);
    if (cleaned) found.push(/^https?:/i.test(cleaned) ? cleaned : `https://${cleaned}`);
    match = re.exec(text);
  }
  return found;
}

export function extractUrl(text: string): string | null {
  return extractAllUrls(text)[0] ?? null;
}

export function looksLikeFacebookUrl(value: string): boolean {
  return FB_DOMAIN_RE.test(value);
}

export function isNumericFacebookId(value: string): boolean {
  return NUMERIC_ID_RE.test(value);
}

export function stripTrackingParams(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const keep = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) keep.append(key, value);
    }
    url.search = keep.toString();
    url.hash = '';
    const out = url.toString();
    return out.endsWith('?') ? out.slice(0, -1) : out;
  } catch {
    return rawUrl;
  }
}

export function watchUrlForId(id: string): string {
  return `https://www.facebook.com/watch/?v=${encodeURIComponent(id)}`;
}

export function reelUrlForId(id: string): string {
  return `https://www.facebook.com/reel/${encodeURIComponent(id)}/`;
}

function numericRef(id: string, kind: VideoKind, webUrl: string): VideoRef {
  return { id, kind, resolvedBy: 'url', webUrl, isNumericId: true };
}

function fallbackRef(raw: string): VideoRef {
  const isUrl = /^https?:\/\//i.test(raw);
  return {
    id: `hash:${stableHash(raw)}`,
    kind: 'unknown',
    resolvedBy: 'unknown',
    webUrl: isUrl ? stripTrackingParams(raw) : '',
    isNumericId: false,
  };
}

/**
 * Chuẩn hoá bất kỳ chuỗi nào (URL đầy đủ, URL thiếu scheme, chuỗi chia sẻ
 * lẫn văn bản, hoặc ID số) thành tham chiếu video.
 */
export function normalizeVideoId(raw: string): VideoRef {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return fallbackRef(trimmed);

  if (NUMERIC_ID_RE.test(trimmed)) {
    return numericRef(trimmed, 'watch', watchUrlForId(trimmed));
  }

  const url = extractUrl(trimmed);
  if (!url) return fallbackRef(trimmed);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fallbackRef(trimmed);
  }

  const host = parsed.hostname.toLowerCase();
  const hostBare = host.replace(/^(www|web|m|mbasic|business)\./, '');
  const isFbWatch = hostBare === 'fb.watch' || hostBare === 'fb.gg' || hostBare === 'm.me';
  const isFacebook = isFbWatch || hostBare === 'facebook.com' || host.endsWith('.facebook.com');
  if (!isFacebook) return fallbackRef(trimmed);

  const segments = parsed.pathname.split('/').filter(Boolean);
  const lower = segments.map((s) => s.toLowerCase());

  if (isFbWatch) {
    const code = segments[0];
    if (code) {
      return {
        id: `fbwatch:${code}`,
        kind: 'short_link',
        resolvedBy: 'shortlink',
        webUrl: stripTrackingParams(url),
        isNumericId: false,
      };
    }
    return fallbackRef(trimmed);
  }

  const shareIdx = lower.indexOf('share');
  if (shareIdx >= 0) {
    const marker = lower[shareIdx + 1];
    const code = segments[shareIdx + 2];
    if (code && (marker === 'v' || marker === 'r')) {
      return {
        id: `share:${marker}:${code}`,
        kind: 'short_link',
        resolvedBy: 'shortlink',
        webUrl: stripTrackingParams(url),
        isNumericId: false,
      };
    }
  }

  const reelIdx = lower.findIndex((s) => s === 'reel' || s === 'reels');
  if (reelIdx >= 0) {
    const candidate = segments[reelIdx + 1];
    if (candidate && NUMERIC_ID_RE.test(candidate)) {
      return numericRef(candidate, 'reel', reelUrlForId(candidate));
    }
  }

  const videoIdx = lower.findIndex((s) => s === 'videos' || s === 'video');
  if (videoIdx >= 0) {
    const candidate = segments[videoIdx + 1];
    if (candidate && NUMERIC_ID_RE.test(candidate)) {
      return numericRef(candidate, 'video', watchUrlForId(candidate));
    }
  }

  const watchIdx = lower.indexOf('watch');
  const vParam = parsed.searchParams.get('v') ?? parsed.searchParams.get('video_id');
  if (vParam && NUMERIC_ID_RE.test(vParam)) {
    return numericRef(vParam, 'watch', watchUrlForId(vParam));
  }

  const storyFbid = parsed.searchParams.get('story_fbid') ?? parsed.searchParams.get('fbid');
  if (storyFbid && NUMERIC_ID_RE.test(storyFbid)) {
    return numericRef(storyFbid, 'video', watchUrlForId(storyFbid));
  }

  if (watchIdx >= 0) return fallbackRef(trimmed);
  return fallbackRef(trimmed);
}

/** Tiêu đề tạm khi không lấy được tiêu đề thật. */
export function placeholderTitle(ref: VideoRef): string {
  if (ref.kind === 'reel') return `Reel ${ref.id}`;
  if (ref.isNumericId) return `Video ${ref.id}`;
  return `Video ${ref.id}`;
}

/** Ảnh đại diện chỉ dùng được với ID số. */
export function thumbnailUrlForId(id: string): string | null {
  if (!isNumericFacebookId(id)) return null;
  return `https://graph.facebook.com/${id}/picture?type=large`;
}

/**
 * Suy loại video từ bản ghi đã lưu, phục vụ việc chọn deep link.
 * Bản ghi không lưu sẵn `kind` nên phải suy lại từ id/url/resolvedBy.
 */
export function inferKind(id: string, url: string, resolvedBy: ResolvedBy): VideoKind {
  if (id.startsWith('fbwatch:') || id.startsWith('share:')) return 'short_link';
  if (resolvedBy === 'unknown' || resolvedBy === 'hash') return 'unknown';
  if (/\/reels?\//.test(url)) return 'reel';
  if (isNumericFacebookId(id)) return 'watch';
  return 'unknown';
}
