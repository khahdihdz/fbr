export interface ProbeEntry {
  at: number;
  event: string;
  data?: unknown;
}

const STORAGE_KEY = 'fbr:probe';
const LIMIT = 50;

function readInitial(): ProbeEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ProbeEntry =>
        typeof entry === 'object' && entry !== null && typeof (entry as ProbeEntry).event === 'string',
    );
  } catch {
    return [];
  }
}

function persist(entries: ProbeEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* bỏ qua: chế độ riêng tư có thể chặn ghi */
  }
}

/**
 * Nhật ký chẩn đoán. Đây là công cụ để người dùng tự xác minh kênh share
 * target và session timer có thật sự chạy trên thiết bị của họ hay không.
 */
export class ProbeLog {
  private entries: ProbeEntry[];

  constructor() {
    this.entries = readInitial();
  }

  log(event: string, data?: unknown): void {
    const entry: ProbeEntry = { at: Date.now(), event };
    if (data !== undefined) entry.data = data;
    this.entries.push(entry);
    if (this.entries.length > LIMIT) this.entries = this.entries.slice(-LIMIT);
    persist(this.entries);
  }

  list(): ProbeEntry[] {
    return [...this.entries].reverse();
  }

  clear(): void {
    this.entries = [];
    persist(this.entries);
  }

  environment(): Record<string, string> {
    const standalone =
      typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
    return {
      userAgent: navigator.userAgent,
      displayMode: standalone ? 'standalone' : 'browser',
      visibility: document.visibilityState,
      language: navigator.language,
      url: window.location.href,
      secureContext: String(window.isSecureContext),
    };
  }

  toJson(): string {
    return `${JSON.stringify(
      { exportedAt: Date.now(), environment: this.environment(), entries: this.list() },
      null,
      2,
    )}\n`;
  }
}
