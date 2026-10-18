import type { Ctx } from '../app';
import { el, clear, downloadText, toast } from '../utils/dom';
import { formatDateTime } from '../utils/format';

/** Khối chẩn đoán nhúng trong trang Cài đặt. */
export function probeHost(ctx: Ctx): HTMLElement {
  const host = el('div', { class: 'mount' });
  const toggle = el('button', {
    class: 'btn btn--ghost',
    text: 'Xem chẩn đoán',
    attrs: { type: 'button' },
    on: {
      click: () => {
        clear(host);
        host.appendChild(renderProbePanel(ctx));
      },
    },
  });
  host.appendChild(toggle);
  return host;
}

export function renderProbePanel(ctx: Ctx): HTMLElement {
  const entries = ctx.probe.list();
  const env = ctx.probe.environment();

  const envList = el(
    'ul',
    { class: 'facts' },
    [
      el('li', { text: `version: ${ctx.version}` }),
      ...Object.entries(env).map(([key, value]) => el('li', { text: `${key}: ${value}` })),
    ],
  );

  const logList = entries.length
    ? el(
        'ul',
        { class: 'probelist' },
        entries.map((entry) =>
          el('li', {
            text: `${formatDateTime(entry.at)} · ${entry.event}${
              entry.data === undefined ? '' : ` · ${JSON.stringify(entry.data)}`
            }`,
          }),
        ),
      )
    : el('p', { class: 'hint', text: 'Chưa có sự kiện nào được ghi lại.' });

  return el('section', { class: 'panel' }, [
    el('h3', { class: 'panel__title', text: 'Chẩn đoán' }),
    el('p', {
      class: 'hint',
      text:
        'Đây là bằng chứng duy nhất cho biết kênh chia sẻ và kênh ước lượng có chạy trên máy bạn hay không. ' +
        'Hãy thử chia sẻ một video từ app Facebook vào webapp rồi xem nhật ký bên dưới.',
    }),
    envList,
    el('div', { class: 'panel__actions' }, [
      el('button', {
        class: 'btn',
        text: 'Tải log .json',
        attrs: { type: 'button' },
        on: {
          click: () => {
            downloadText('fbr-probe.json', ctx.probe.toJson());
            toast('Đã tải log chẩn đoán.', 'success');
          },
        },
      }),
      el('button', {
        class: 'btn btn--ghost',
        text: 'Xoá log',
        attrs: { type: 'button' },
        on: {
          click: () => {
            ctx.probe.clear();
            toast('Đã xoá log.', 'success');
            ctx.refresh();
          },
        },
      }),
    ]),
    el('h4', { class: 'panel__subtitle', text: `50 sự kiện gần nhất (${entries.length})` }),
    logList,
  ]);
}

export async function renderProbeScreen(container: HTMLElement, ctx: Ctx): Promise<void> {
  clear(container);
  container.appendChild(el('h2', { class: 'section-title', text: 'Chẩn đoán kênh thu thập' }));
  container.appendChild(
    el('ul', { class: 'facts' }, [
      el('li', { text: 'Kênh 1 — Web Share Target: tự động khi bạn chia sẻ link từ app Facebook vào webapp đã cài.' }),
      el('li', { text: 'Kênh 2 — Session timer: ước lượng theo thời gian bạn rời webapp, luôn hỏi lại bạn.' }),
      el('li', { text: 'Kênh 3 — Facebook export: chính xác nhất, không kèm vị trí phút:giây.' }),
      el('li', { text: 'Kênh 4 — Dán link & nhập tay: luôn hoạt động.' }),
    ]),
  );
  container.appendChild(renderProbePanel(ctx));
}
