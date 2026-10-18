import type { Ctx } from '../app';
import { el, clear, toast, downloadText, copyText, confirmAction } from '../utils/dom';
import { serializeCsv, serializeFbrExport } from '../import/fbrJson';
import { formatNumber } from '../utils/format';
import { probeHost } from './probeScreen';

export type ThemeChoice = 'auto' | 'light' | 'dark';
export const THEME_KEY = 'fbr:theme';
export const SYNC_ENDPOINT_KEY = 'fbr:sync:endpoint';
export const SYNC_TOKEN_KEY = 'fbr:sync:token';
export const SYNC_ENABLED_KEY = 'fbr:sync:enabled';

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* bỏ qua */
  }
}

export function loadTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw;
  } catch {
    /* bỏ qua */
  }
  return 'auto';
}

function readPref(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* bỏ qua */
  }
}

function fileName(prefix: string, ext: string): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const time = [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0')].join('');
  return `${prefix}-${stamp}-${time}.${ext}`;
}

export async function renderSettings(container: HTMLElement, ctx: Ctx): Promise<void> {
  const videos = await ctx.repo.all();
  clear(container);

  const themeSelect = el('select', {
    class: 'input',
    attrs: { 'aria-label': 'Chủ đề' },
    on: { change: (event) => applyTheme((event.target as HTMLSelectElement).value as ThemeChoice) },
  });
  for (const [value, label] of [['auto', 'Theo hệ thống'], ['light', 'Sáng'], ['dark', 'Tối']] as const) {
    const option = el('option', { text: label, attrs: { value } });
    if (readPref(THEME_KEY) === value || (readPref(THEME_KEY) === '' && value === 'auto')) {
      option.setAttribute('selected', '');
    }
    themeSelect.appendChild(option);
  }

  const dataPanel = el('section', { class: 'panel' }, [
    el('h3', { class: 'panel__title', text: 'Dữ liệu' }),
    el('p', { class: 'hint', text: `${formatNumber(videos.length)} bản ghi đang lưu trong IndexedDB trên thiết bị này.` }),
    el('div', { class: 'panel__actions' }, [
      el('button', {
        class: 'btn',
        text: 'Xuất JSON',
        attrs: { type: 'button' },
        on: {
          click: () => {
            downloadText(fileName('fbr-export', 'json'), serializeFbrExport(videos, ctx.now()));
            ctx.probe.log('export_json', { count: videos.length });
            toast('Đã tải file JSON.', 'success');
          },
        },
      }),
      el('button', {
        class: 'btn',
        text: 'Xuất CSV',
        attrs: { type: 'button' },
        on: {
          click: () => {
            downloadText(fileName('fbr-export', 'csv'), serializeCsv(videos), 'text/csv');
            toast('Đã tải file CSV.', 'success');
          },
        },
      }),
      el('button', {
        class: 'btn btn--ghost',
        text: 'Sao chép JSON',
        attrs: { type: 'button' },
        on: {
          click: () =>
            void copyText(serializeFbrExport(videos, ctx.now())).then((ok) =>
              toast(ok ? 'Đã sao chép JSON.' : 'Không sao chép được.', ok ? 'success' : 'error'),
            ),
        },
      }),
      el('a', { class: 'btn btn--ghost', text: 'Nhập dữ liệu', attrs: { href: '#/import' } }),
    ]),
  ]);

  const endpointInput = el('input', {
    class: 'input',
    attrs: { type: 'url', placeholder: 'https://…/fbr-sync', value: readPref(SYNC_ENDPOINT_KEY) },
    on: { change: (event) => writePref(SYNC_ENDPOINT_KEY, (event.target as HTMLInputElement).value.trim()) },
  }) as HTMLInputElement;
  endpointInput.value = readPref(SYNC_ENDPOINT_KEY);

  const tokenInput = el('input', {
    class: 'input',
    attrs: { type: 'password', placeholder: 'token (chỉ lưu trên máy)', value: readPref(SYNC_TOKEN_KEY) },
    on: { change: (event) => writePref(SYNC_TOKEN_KEY, (event.target as HTMLInputElement).value) },
  }) as HTMLInputElement;
  tokenInput.value = readPref(SYNC_TOKEN_KEY);

  const syncToggle = el('input', {
    attrs: { type: 'checkbox', id: 'sync-enabled' },
    on: {
      change: (event) => {
        const enabled = (event.target as HTMLInputElement).checked;
        writePref(SYNC_ENABLED_KEY, enabled ? '1' : '0');
        toast(
          enabled
            ? 'Đã bật đồng bộ. Dữ liệu sẽ được gửi tới endpoint bạn cấu hình.'
            : 'Đã tắt đồng bộ.',
          'info',
        );
      },
    },
  }) as HTMLInputElement;
  syncToggle.checked = readPref(SYNC_ENABLED_KEY) === '1';

  const syncPanel = el('section', { class: 'panel' }, [
    el('h3', { class: 'panel__title', text: 'Đồng bộ (mặc định tắt)' }),
    el('p', {
      class: 'hint',
      text:
        'Webapp không có backend. Nếu bạn tự dựng một endpoint, bật mục này để đẩy dữ liệu lên. ' +
        'Khi tắt, không có byte nào rời khỏi thiết bị của bạn.',
    }),
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'Sync endpoint' }),
      endpointInput,
    ]),
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'Token' }),
      tokenInput,
    ]),
    el('label', { class: 'switch' }, [
      syncToggle,
      el('span', { text: 'Bật đồng bộ' }),
    ]),
  ]);

  const dangerPanel = el('section', { class: 'panel panel--danger' }, [
    el('h3', { class: 'panel__title', text: 'Vùng nguy hiểm' }),
    el('p', { class: 'hint', text: 'Xoá toàn bộ dữ liệu tiến trình trên thiết bị này. Không thể hoàn tác.' }),
    el('div', { class: 'panel__actions' }, [
      el('button', {
        class: 'btn btn--danger',
        text: 'Xoá tất cả dữ liệu',
        attrs: { type: 'button' },
        on: {
          click: () => {
            void (async () => {
              const ok = await confirmAction(
                `Xoá ${formatNumber(videos.length)} bản ghi? Hãy xuất JSON trước nếu bạn muốn giữ lại.`,
                'Xoá tất cả',
              );
              if (!ok) return;
              await ctx.repo.clear();
              ctx.probe.log('clear_all');
              toast('Đã xoá toàn bộ dữ liệu.', 'success');
              ctx.refresh();
            })();
          },
        },
      }),
    ]),
  ]);

  const aboutPanel = el('section', { class: 'panel' }, [
    el('h3', { class: 'panel__title', text: 'Về webapp này' }),
    el('ul', { class: 'facts' }, [
      el('li', { text: 'Không có server, không analytics, không telemetry.' }),
      el('li', { text: 'Dữ liệu nằm trong IndexedDB của trình duyệt bạn đang dùng.' }),
      el('li', { text: 'Webapp không đọc được tiến trình từ app Facebook; xem tab Chẩn đoán để hiểu rõ hơn.' }),
      el('li', { text: 'Không dùng API nội bộ Facebook, không scraping, không tự động hoá.' }),
    ]),
    el('div', { class: 'panel__actions' }, [
      el('a', { class: 'btn btn--ghost', text: 'Chính sách riêng tư', attrs: { href: './privacy.html' } }),
      el('a', { class: 'btn btn--ghost', text: 'Hướng dẫn cài đặt', attrs: { href: './install.html' } }),
      el('button', {
        class: 'btn',
        text: 'Chẩn đoán',
        attrs: { type: 'button' },
        on: { click: () => ctx.navigate('/probe') },
      }),
    ]),
  ]);

  const themePanel = el('section', { class: 'panel' }, [
    el('h3', { class: 'panel__title', text: 'Giao diện' }),
    el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Chủ đề' }), themeSelect]),
  ]);

  container.appendChild(el('h2', { class: 'section-title', text: 'Cài đặt' }));
  container.appendChild(themePanel);
  container.appendChild(dataPanel);
  container.appendChild(probeHost(ctx));
  container.appendChild(syncPanel);
  container.appendChild(dangerPanel);
  container.appendChild(aboutPanel);
}
