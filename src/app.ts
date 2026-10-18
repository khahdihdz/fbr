import type { VideoProgress } from './types';
import type { VideoRepo } from './db/repo';
import { createVideoProgress, markCompleted } from './progress/merge';
import { beginSession, endSession, readSession } from './progress/session';
import { ProbeLog } from './ui/probe';
import { createShell, type Shell } from './ui/layout';
import { renderDashboard } from './ui/dashboard';
import { renderStats } from './ui/stats';
import { renderImport } from './ui/importScreen';
import { renderSettings } from './ui/settings';
import { renderProbeScreen } from './ui/probeScreen';
import { renderDetail } from './ui/detail';
import { promptForSession } from './ui/sessionPrompt';
import { applyTheme, loadTheme } from './ui/settings';
import { consumePendingShare, readShareFromLocation, refFromShare } from './share/shareTarget';
import { inferKind, normalizeVideoId } from './video/videoId';
import { launchInFacebook } from './video/deepLink';
import { clear, el, openSheet, toast } from './utils/dom';
import { createTimeField } from './ui/timeField';

export interface Ctx {
  repo: VideoRepo;
  probe: ProbeLog;
  now(): number;
  navigate(route: string): void;
  refresh(): void;
  startWatch(video: VideoProgress, mode?: 'deep' | 'http'): void;
}

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Tổng quan',
  '/watch': 'Chi tiết video',
  '/stats': 'Thống kê',
  '/import': 'Nhập dữ liệu',
  '/settings': 'Cài đặt',
  '/probe': 'Chẩn đoán',
  '/share': 'Chia sẻ',
};

interface ParsedRoute {
  route: string;
  params: string[];
}

export function parseRoute(hash: string): ParsedRoute {
  const raw = hash.replace(/^#/, '');
  const clean = (raw.split('?')[0] ?? '').trim();
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return { route: '/', params: [] };
  const first = parts[0] ?? '';
  return { route: `/${first}`, params: parts.slice(1) };
}

export class App {
  readonly ctx: Ctx;
  private readonly shell: Shell;
  private rendering = false;

  constructor(root: HTMLElement, repo: VideoRepo) {
    this.shell = createShell(root);
    const probe = new ProbeLog();

    this.ctx = {
      repo,
      probe,
      now: () => Date.now(),
      navigate: (route: string) => {
        const next = `#${route.startsWith('/') ? route : `/${route}`}`;
        if (window.location.hash === next) void this.render();
        else window.location.hash = next;
      },
      refresh: () => void this.render(),
      startWatch: (video: VideoProgress, mode: 'deep' | 'http' = 'deep') => this.startWatch(video, mode),
    };

    applyTheme(loadTheme());

    window.addEventListener('hashchange', () => void this.render());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.resumeSession();
    });
    window.addEventListener('pageshow', (event) => {
      if ((event as PageTransitionEvent).persisted) void this.resumeSession();
    });

    probe.log('app_start', { hash: window.location.hash, search: window.location.search });
  }

  async start(): Promise<void> {
    await this.render();
  }

  private async render(): Promise<void> {
    if (this.rendering) return;
    this.rendering = true;
    try {
      const { route, params } = parseRoute(window.location.hash);
      this.shell.setActive(route);
      this.shell.setTitle(ROUTE_TITLES[route] ?? 'FB Watch Progress');
      this.shell.setActions(this.headerActions());
      clear(this.shell.main);

      switch (route) {
        case '/watch':
          await renderDetail(this.shell.main, this.ctx, params[0] ?? '');
          break;
        case '/stats':
          await renderStats(this.shell.main, this.ctx);
          break;
        case '/import':
          await renderImport(this.shell.main, this.ctx);
          break;
        case '/settings':
          await renderSettings(this.shell.main, this.ctx);
          break;
        case '/probe':
          await renderProbeScreen(this.shell.main, this.ctx);
          break;
        case '/share':
          await this.handleShare();
          break;
        default:
          await renderDashboard(this.shell.main, this.ctx);
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'lỗi không xác định';
      this.ctx.probe.log('render_error', { message });
      clear(this.shell.main);
      this.shell.main.appendChild(
        el('div', { class: 'empty-state' }, [
          el('p', { text: `Có lỗi khi hiển thị trang: ${message}` }),
          el('a', { class: 'btn', text: 'Về tổng quan', attrs: { href: '#/' } }),
        ]),
      );
    } finally {
      this.rendering = false;
    }
  }

  private headerActions(): Node[] {
    return [
      el('button', {
        class: 'btn btn--ghost btn--sm',
        text: 'Chia sẻ link',
        attrs: { type: 'button', title: 'Dán link Facebook để thêm nhanh' },
        on: { click: () => this.openQuickAdd() },
      }),
      el('button', {
        class: 'btn btn--ghost btn--sm',
        text: '?',
        attrs: { type: 'button', 'aria-label': 'Trợ giúp' },
        on: { click: () => this.ctx.navigate('/probe') },
      }),
    ];
  }

  private openQuickAdd(): void {
    const area = el('textarea', {
      class: 'input input--area',
      attrs: { rows: '4', placeholder: 'Dán link Facebook…', 'aria-label': 'Link Facebook' },
    }) as HTMLTextAreaElement;

    openSheet({
      title: 'Thêm video từ link',
      description: 'Dán link rồi vào tab Nhập để đọc hàng loạt, hoặc lưu ngay một link tại đây.',
      body: [area],
      actions: [
        {
          label: 'Lưu link này',
          kind: 'primary',
          onClick: (close) => {
            void (async () => {
              const text = area.value.trim();
              if (!text) {
                toast('Chưa có link nào.', 'error');
                return;
              }
              const ref = normalizeVideoId(text);
              if (ref.kind === 'unknown') {
                toast('Không nhận diện được link Facebook.', 'error');
                return;
              }
              const video = createVideoProgress({
                ref,
                source: 'link_paste',
                now: this.ctx.now(),
                needsReview: true,
                tags: ['link'],
              });
              await this.ctx.repo.put(video);
              this.ctx.probe.log('quick_add', { id: ref.id, kind: ref.kind });
              close();
              toast('Đã thêm vào danh sách.', 'success');
              this.ctx.navigate('/');
            })();
          },
        },
        { label: 'Đóng', kind: 'ghost', onClick: (close) => close() },
      ],
    });
  }

  private startWatch(video: VideoProgress, mode: 'deep' | 'http'): void {
    const kind = inferKind(video.id, video.url, video.resolvedBy);
    beginSession(this.sessionStore(), {
      id: video.id,
      title: video.title,
      positionSec: video.positionSec,
      durationSec: video.durationSec,
      source: mode === 'http' ? 'http' : 'deep_link',
    });
    this.ctx.probe.log('start_watch', { id: video.id, kind, mode });

    if (mode === 'http') {
      window.open(video.url, '_blank', 'noopener');
      return;
    }
    launchInFacebook(
      { id: video.id, kind, webUrl: video.url },
      {
        onFallback: () => this.ctx.probe.log('deep_link_fallback', { id: video.id }),
      },
    );
  }

  private async resumeSession(): Promise<void> {
    const session = readSession(this.sessionStore());
    if (!session) return;
    const elapsed = this.ctx.now() - session.startedAt;
    const video = await this.ctx.repo.get(session.id);
    endSession(this.sessionStore());

    if (!video) {
      this.ctx.probe.log('session_missing_video', { id: session.id });
      return;
    }
    if (elapsed < 5_000) {
      this.ctx.probe.log('session_too_short', { id: session.id, elapsed });
      return;
    }
    this.ctx.probe.log('session_returned', { id: session.id, elapsed });
    promptForSession(session, video, elapsed, this.ctx);
  }

  private sessionStore(): Storage {
    return window.sessionStorage;
  }

  private async handleShare(): Promise<void> {
    const share = readShareFromLocation(window.location.search) ?? consumePendingShare(window.sessionStorage);
    this.ctx.probe.log('share_received', {
      hasUrl: Boolean(share?.url),
      hasText: Boolean(share?.text),
      hasTitle: Boolean(share?.title),
    });

    if (!share) {
      toast('Không có nội dung nào được chia sẻ.', 'error');
      this.ctx.navigate('/');
      return;
    }

    const ref = refFromShare(share);
    if (!ref) {
      openSheet({
        title: 'Không đọc được link trong nội dung chia sẻ',
        description: share.text || share.title || '(rỗng)',
        body: [el('p', { class: 'hint', text: 'Bạn có thể vào tab Nhập để dán link thủ công.' })],
        actions: [
          { label: 'Mở tab Nhập', kind: 'primary', onClick: (close) => { close(); this.ctx.navigate('/import'); } },
          { label: 'Đóng', kind: 'ghost', onClick: (close) => close() },
        ],
      });
      return;
    }

    const now = this.ctx.now();
    const video = createVideoProgress({
      ref,
      source: 'share_target',
      now,
      title: share.title || undefined,
      needsReview: true,
      tags: ['share'],
    });

    const positionField = createTimeField({
      legend: 'Đang xem tới',
      hint: 'Nhập giờ / phút / giây. Có thể dán thẳng "1:05:03" vào bất kỳ ô nào.',
    });
    const durationField = createTimeField({
      legend: 'Thời lượng video',
      hint: 'Bỏ trống thời lượng thì video sẽ nằm trong tab "Cần rà lại" cho tới khi bạn điền.',
      onChange: (seconds) => {
        positionField.setMaxSeconds(seconds > 0 ? seconds : undefined);
      },
    });

    const guard = (): boolean => {
      const invalid = [durationField, positionField].find((field) => !field.isValid());
      if (invalid) {
        toast(invalid.message() ?? 'Thời gian không hợp lệ.', 'error');
        return false;
      }
      return true;
    };

    openSheet({
      title: 'Đã nhận video',
      description: video.title,
      body: [
        el('p', { class: 'hint', text: video.url }),
        durationField.node,
        positionField.node,
      ],
      actions: [
        {
          label: 'Lưu (đang xem dở)',
          kind: 'primary',
          onClick: (close) => {
            if (!guard()) return;
            void (async () => {
              const duration = durationField.getSeconds();
              const saved = createVideoProgress({
                ref,
                source: 'share_target',
                now,
                title: share.title || undefined,
                durationSec: duration,
                positionSec: positionField.getSeconds(),
                tags: ['share'],
                needsReview: duration <= 0,
              });
              await this.ctx.repo.put(saved);
              close();
              toast('Đã lưu.', 'success');
              this.ctx.navigate('/');
            })();
          },
        },
        {
          label: 'Bắt đầu từ đầu',
          kind: 'ghost',
          onClick: (close) => {
            void (async () => {
              await this.ctx.repo.put(video);
              close();
              toast('Đã lưu với vị trí 0.', 'success');
              this.ctx.navigate('/');
            })();
          },
        },
        {
          label: 'Đã xem xong',
          kind: 'ghost',
          onClick: (close) => {
            if (!guard()) return;
            void (async () => {
              const duration = durationField.getSeconds();
              const saved = createVideoProgress({
                ref,
                source: 'share_target',
                now,
                title: share.title || undefined,
                durationSec: duration,
                tags: ['share'],
                needsReview: duration <= 0,
              });
              await this.ctx.repo.put(markCompleted(saved, now));
              close();
              toast('Đã đánh dấu xem xong.', 'success');
              this.ctx.navigate('/');
            })();
          },
        },
      ],
    });
  }
}

export function createApp(root: HTMLElement, repo: VideoRepo): App {
  const app = new App(root, repo);
  void app.start();
  return app;
}
