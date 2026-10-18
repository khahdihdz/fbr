import type { VideoKind, VideoRef } from '../types';
import { isNumericFacebookId, watchUrlForId } from './videoId';

/**
 * Danh sách deep link `fb://` để thử mở app Facebook.
 *
 * Lưu ý trung thực: các scheme này không được Facebook tài liệu hoá công khai,
 * chúng có thể đổi bất cứ lúc nào. Vì vậy mọi lần mở đều phải có fallback
 * sang URL https sau một khoảng trễ ngắn.
 */
export function deepLinkCandidates(id: string, kind: VideoKind, webUrl = ''): string[] {
  const safeId = encodeURIComponent(id);
  switch (kind) {
    case 'reel':
      return [`fb://reel/${safeId}`, `fb://reels/?id=${safeId}`];
    case 'watch':
    case 'video':
      if (!isNumericFacebookId(id)) return [];
      return [`fb://watch/?v=${safeId}`, `fb://video/?id=${safeId}`];
    case 'short_link':
      if (webUrl) {
        return [`fb://facewebmodal/f?href=${encodeURIComponent(webUrl)}`];
      }
      return [];
    case 'unknown':
    default:
      return webUrl ? [`fb://facewebmodal/f?href=${encodeURIComponent(webUrl)}`] : [];
  }
}

/** Chọn URL https để mở trên trình duyệt khi deep link thất bại. */
export function httpFallback(ref: Pick<VideoRef, 'id' | 'kind' | 'webUrl'>): string {
  if (ref.webUrl) return ref.webUrl;
  if (isNumericFacebookId(ref.id)) return watchUrlForId(ref.id);
  return 'https://www.facebook.com/watch/';
}

export interface LaunchOptions {
  fallbackMs?: number;
  onFallback?: () => void;
}

/**
 * Điều hướng sang app Facebook, kèm fallback sang https nếu trình duyệt
 * vẫn còn ở trang này sau `fallbackMs`.
 */
export function launchInFacebook(
  ref: Pick<VideoRef, 'id' | 'kind' | 'webUrl'>,
  options: LaunchOptions = {},
): void {
  const fallbackMs = options.fallbackMs ?? 700;
  const candidates = deepLinkCandidates(ref.id, ref.kind, ref.webUrl);
  const target = candidates[0];

  if (!target) {
    window.location.href = httpFallback(ref);
    return;
  }

  const fallbackTimer = setTimeout(() => {
    if (document.visibilityState === 'visible') {
      options.onFallback?.();
      window.location.href = httpFallback(ref);
    }
  }, fallbackMs);
  window.addEventListener('pagehide', () => clearTimeout(fallbackTimer), { once: true });

  window.location.href = target;
}
