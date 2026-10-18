type Child = Node | string | null | undefined | false;

export type { Child };

export interface ElProps {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  dataset?: Record<string, string>;
  style?: Record<string, string>;
  on?: Record<string, (event: Event) => void>;
}

/** Tạo element với thuộc tính, style, dataset và listener. */
export function el(tag: string, props: ElProps = {}, children: Child[] = []): HTMLElement {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  if (props.dataset) {
    for (const [key, value] of Object.entries(props.dataset)) node.dataset[key] = value;
  }
  if (props.style) {
    for (const [key, value] of Object.entries(props.style)) node.style.setProperty(key, value);
  }
  if (props.on) {
    for (const [key, handler] of Object.entries(props.on)) node.addEventListener(key, handler);
  }
  appendChildren(node, children);
  return node;
}

export function appendChildren(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function qs<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector(selector);
  if (!found) throw new Error(`Không tìm thấy phần tử: ${selector}`);
  return found as T;
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (handle !== undefined) clearTimeout(handle);
    handle = setTimeout(() => {
      handle = undefined;
      fn(...args);
    }, ms);
  };
}

let toastHost: HTMLElement | null = null;

function ensureToastHost(): HTMLElement {
  if (toastHost && toastHost.isConnected) return toastHost;
  const host = el('div', { class: 'toast-host', attrs: { 'aria-live': 'polite' } });
  document.body.appendChild(host);
  toastHost = host;
  return host;
}

/** Thông báo ngắn cho người dùng. */
export function toast(message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
  const host = ensureToastHost();
  const item = el('div', { class: `toast toast--${kind}`, text: message });
  host.appendChild(item);
  setTimeout(() => {
    item.classList.add('toast--out');
    setTimeout(() => item.remove(), 240);
  }, 3600);
}

export interface SheetAction {
  label: string;
  kind?: 'primary' | 'danger' | 'ghost';
  onClick: (close: () => void) => void;
}

export interface SheetOptions {
  title: string;
  description?: string;
  body?: Child[];
  actions: SheetAction[];
  onClose?: () => void;
}

/** Mở bottom-sheet / dialog đơn giản, trả về hàm đóng. */
export function openSheet(options: SheetOptions): () => void {
  const close = (): void => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    options.onClose?.();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };

  const body = el('div', { class: 'sheet__body' }, options.body ?? []);
  const actions = el(
    'div',
    { class: 'sheet__actions' },
    options.actions.map((action) =>
      el('button', {
        class: `btn btn--${action.kind ?? 'ghost'}`,
        text: action.label,
        attrs: { type: 'button' },
        on: { click: () => action.onClick(close) },
      }),
    ),
  );

  const panel = el(
    'div',
    { class: 'sheet', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title } },
    [
      el('h2', { class: 'sheet__title', text: options.title }),
      options.description ? el('p', { class: 'sheet__desc', text: options.description }) : null,
      body,
      actions,
    ],
  );

  const backdrop = el('div', { class: 'backdrop' }, [panel]);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  const firstButton = panel.querySelector('button');
  if (firstButton instanceof HTMLElement) firstButton.focus();
  return close;
}

export function confirmAction(message: string, confirmLabel = 'Xác nhận'): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const close = openSheet({
      title: 'Xác nhận',
      description: message,
      actions: [
        { label: 'Huỷ', kind: 'ghost', onClick: (c) => { settled = true; c(); resolve(false); } },
        { label: confirmLabel, kind: 'danger', onClick: (c) => { settled = true; c(); resolve(true); } },
      ],
      onClose: () => {
        if (!settled) resolve(false);
      },
    });
    void close;
  });
}

/** Tải một Blob xuống máy người dùng. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = el('a', { attrs: { href: url, download: filename } });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* rơi xuống phương án dự phòng */
  }
  try {
    const area = el('textarea', { attrs: { readonly: 'readonly' } }) as HTMLTextAreaElement;
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
