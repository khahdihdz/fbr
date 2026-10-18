/**
 * Các hàm thuần để nhận biết "có bản mới" — không đụng tới DOM hay mạng,
 * nhờ vậy test được bằng vitest (môi trường node).
 *
 * Nguồn sự thật của phiên bản là hai file do `scripts/gen-precache.mjs` sinh ra
 * trong lúc build:
 *   - thẻ <meta name="fbr-version"> trong dist/index.html (bản đang chạy)
 *   - dist/version.json (bản đang có trên máy chủ, không được precache)
 */
export interface VersionInfo {
  version: string;
  commit?: string | null;
  builtAt?: string | null;
  /** Hash nội dung của dist, khác với `version` khi build ngoài CI. */
  content?: string | null;
  /** Số thứ tự lần chạy GitHub Actions, nếu build trên CI. */
  run?: string | null;
}

export const DEV_VERSION = 'dev';
export const VERSION_FILE = 'version.json';

const PLACEHOLDER = '__FBR_VERSION__';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Chuẩn hoá chuỗi phiên bản đọc từ <meta>; token chưa thay thế coi như bản dev. */
export function sanitizeVersion(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value || value === PLACEHOLDER) return DEV_VERSION;
  return value;
}

/** Đọc nội dung version.json; trả null nếu không phải JSON hợp lệ. */
export function parseVersionInfo(text: string): VersionInfo | null {
  const raw = text.trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const version = asString(record['version']);
  if (!version) return null;
  return {
    version,
    commit: asString(record['commit']),
    builtAt: asString(record['builtAt']),
    content: asString(record['content']),
    run: asString(record['run']),
  };
}

/** Bản trên máy chủ khác bản đang chạy hay không. */
export function isUpdateAvailable(remote: VersionInfo | null | undefined, local: string): boolean {
  if (!remote) return false;
  const remoteVersion = remote.version.trim();
  const localVersion = local.trim();
  if (!remoteVersion || !localVersion) return false;
  if (localVersion === DEV_VERSION || remoteVersion === DEV_VERSION) return false;
  return remoteVersion !== localVersion;
}

/** Chọn nguồn đầu tiên báo có bản mới (service worker hoặc version.json). */
export function pickUpdate(
  local: string,
  candidates: Array<VersionInfo | null | undefined>,
): VersionInfo | null {
  for (const candidate of candidates) {
    if (isUpdateAvailable(candidate, local)) return candidate ?? null;
  }
  return null;
}

/** Nhãn ngắn để hiển thị, ví dụ "abc1234" hoặc "796f347169bf". */
export function shortVersion(version: string): string {
  const value = version.trim();
  if (!value) return DEV_VERSION;
  return value.length > 12 ? value.slice(0, 12) : value;
}

/** Mô tả đầy đủ: "abc1234 · commit ffffffffffff" (bỏ commit nếu là tiền tố của version). */
export function describeVersion(info: VersionInfo | null | undefined): string {
  if (!info) return 'không rõ';
  const short = shortVersion(info.version);
  const commit = info.commit ? shortVersion(info.commit) : null;
  const parts = [short];
  if (commit && !commit.startsWith(short) && !short.startsWith(commit)) {
    parts.push(`commit ${commit}`);
  }
  return parts.join(' · ');
}

/** URL của version.json, thêm tham số chống cache khi cần. */
export function versionFileUrl(baseUrl: string, cacheBust?: number | string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = `${base}${VERSION_FILE}`;
  if (cacheBust === undefined || cacheBust === '') return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${cacheBust}`;
}
