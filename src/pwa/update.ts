import {
  DEV_VERSION,
  isUpdateAvailable,
  parseVersionInfo,
  pickUpdate,
  sanitizeVersion,
  shortVersion,
  versionFileUrl,
  type VersionInfo,
} from './version';

export type CheckResult = 'updated' | 'current' | 'error' | 'disabled' | 'busy';

export interface UpdateWatcherOptions {
  /** Thường là `import.meta.env.BASE_URL`. */
  baseUrl: string;
  /** Phiên bản của trang đang chạy (đọc từ <meta name="fbr-version">). */
  localVersion: string;
  onUpdateAvailable(info: VersionInfo): void;
  onResult?(result: CheckResult, info: VersionInfo | null): void;
  log?(event: string, data?: Record<string, unknown>): void;
  intervalMs?: number;
}

/** Kiểm tra định kỳ khi app đang mở. */
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
/** Lần kiểm tra đầu tiên, chờ một chút cho service worker ổn định. */
const INITIAL_DELAY_MS = 5000;
/** Không kiểm tra lại quá dày khi người dùng qua lại giữa các tab. */
const VISIBILITY_THROTTLE_MS = 60 * 1000;
const SW_TIMEOUT_MS = 1500;
const FETCH_TIMEOUT_MS = 8000;

/** Đọc phiên bản build từ thẻ meta do gen-precache chèn vào dist/index.html. */
export function readBuildVersion(doc: Document = document): VersionInfo {
  const meta = (name: string): string =>
    doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? '';
  return {
    version: sanitizeVersion(meta('fbr-version')),
    commit: meta('fbr-commit') || null,
    builtAt: meta('fbr-built') || null,
  };
}

/** Hỏi service worker đang điều khiển trang xem nó thuộc bản build nào. */
function askServiceWorkerVersion(
  worker: ServiceWorker,
  timeoutMs = SW_TIMEOUT_MS,
): Promise<VersionInfo | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.onmessage = null;
      resolve(null);
    }, timeoutMs);
    channel.port1.onmessage = (event: MessageEvent) => {
      clearTimeout(timer);
      const data = event.data as { type?: string; version?: string } | null;
      if (data?.type === 'FBR_VERSION' && typeof data.version === 'string' && data.version) {
        resolve({ version: data.version });
        return;
      }
      resolve(null);
    };
    try {
      worker.postMessage({ type: 'FBR_GET_VERSION' }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Tải version.json, luôn bỏ qua cache của trình duyệt và của service worker. */
async function fetchRemoteVersion(
  baseUrl: string,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<VersionInfo | null> {
  if (typeof fetch !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(versionFileUrl(baseUrl, Date.now()), {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return parseVersionInfo(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Theo dõi ba kênh báo bản mới:
 *   1. version.json trên máy chủ (hoạt động cả khi không có service worker)
 *   2. service worker đang điều khiển trang nhưng thuộc bản build khác
 *   3. service worker vừa cài xong bản mới (updatefound → installed)
 */
export class UpdateWatcher {
  private readonly baseUrl: string;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private started = false;
  private wired = false;
  private lastCheckAt = 0;
  private lastResult: CheckResult | null = null;
  private lastRemote: VersionInfo | null = null;

  readonly localVersion: string;

  constructor(private readonly options: UpdateWatcherOptions) {
    this.baseUrl = options.baseUrl;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.localVersion = options.localVersion;
  }

  get enabled(): boolean {
    return this.localVersion !== DEV_VERSION && typeof fetch === 'function';
  }

  get running(): boolean {
    return this.started;
  }

  get result(): CheckResult | null {
    return this.lastResult;
  }

  get remote(): VersionInfo | null {
    return this.lastRemote;
  }

  start(): void {
    if (this.started) return;
    if (!this.enabled) {
      this.options.log?.('update_watch_disabled', { localVersion: this.localVersion });
      return;
    }
    this.started = true;

    if (!this.wired) {
      this.wired = true;
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          this.options.log?.('sw_controllerchange', { version: this.localVersion });
          void this.check();
        });
        void navigator.serviceWorker.ready
          .then((registration) => this.watchRegistration(registration))
          .catch(() => {});
      }

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          if (Date.now() - this.lastCheckAt < VISIBILITY_THROTTLE_MS) return;
          void this.check();
        });
      }
    }

    if (this.intervalMs > 0) {
      this.startTimer = setTimeout(() => void this.check(), INITIAL_DELAY_MS);
      this.timer = setInterval(() => void this.check(), this.intervalMs);
    }
  }

  stop(): void {
    this.started = false;
    if (this.startTimer !== null) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Kiểm tra ngay; an toàn khi gọi chồng (lần gọi sau bị bỏ qua). */
  async check(): Promise<CheckResult> {
    if (!this.enabled) {
      this.lastResult = 'disabled';
      this.options.onResult?.('disabled', null);
      return 'disabled';
    }
    if (this.busy) return 'busy';

    this.busy = true;
    try {
      const registration = await this.getRegistration();
      const remote = await fetchRemoteVersion(this.baseUrl);
      const swVersion = await this.getServiceWorkerVersion(registration);

      this.lastRemote = remote;
      const local = this.localVersion;
      const found = pickUpdate(local, [remote, swVersion]);

      if (found) {
        this.lastResult = 'updated';
        this.options.log?.('update_available', {
          local,
          remote: shortVersion(found.version),
        });
        this.options.onUpdateAvailable(found);
        this.options.onResult?.('updated', found);
        return 'updated';
      }

      this.lastResult = remote || swVersion ? 'current' : 'error';
      this.options.onResult?.(this.lastResult, remote ?? swVersion);
      return this.lastResult;
    } catch {
      this.lastResult = 'error';
      this.options.onResult?.('error', null);
      return 'error';
    } finally {
      this.lastCheckAt = Date.now();
      this.busy = false;
    }
  }

  /** Tải lại trang để dùng bản mới, ưu tiên để service worker mới tiếp quản trước. */
  apply(): void {
    if (typeof window === 'undefined') return;
    let reloaded = false;
    const reload = (): void => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw || !sw.controller) {
      reload();
      return;
    }

    sw.addEventListener('controllerchange', reload, { once: true });
    void this.requestSkipWaiting().finally(() => {
      setTimeout(reload, 2500);
    });
  }

  private async getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    try {
      return (await navigator.serviceWorker.getRegistration()) ?? null;
    } catch {
      return null;
    }
  }

  private async getServiceWorkerVersion(
    registration: ServiceWorkerRegistration | null,
  ): Promise<VersionInfo | null> {
    const controller =
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? navigator.serviceWorker.controller
        : null;
    if (!registration) return null;
    if (registration.waiting) {
      const info = await askServiceWorkerVersion(registration.waiting);
      if (info) return info;
    }
    if (controller) return askServiceWorkerVersion(controller);
    return null;
  }

  private watchRegistration(registration: ServiceWorkerRegistration): void {
    const track = (worker: ServiceWorker | null): void => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state !== 'installed') return;
        // Lần cài đặt đầu tiên không phải là "bản mới".
        if (typeof navigator === 'undefined' || !navigator.serviceWorker.controller) return;
        this.options.log?.('sw_installed');
        void this.check();
      });
    };

    track(registration.installing);
    registration.addEventListener('updatefound', () => {
      this.options.log?.('sw_updatefound');
      track(registration.installing);
    });
  }

  private async requestSkipWaiting(): Promise<void> {
    try {
      const registration = await this.getRegistration();
      if (!registration) return;
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'FBR_SKIP_WAITING' });
        return;
      }
      await registration.update();
    } catch {
      /* bỏ qua: dù sao trang vẫn tải lại và lấy bản mới từ mạng */
    }
  }
}

export { isUpdateAvailable, parseVersionInfo, versionFileUrl };
