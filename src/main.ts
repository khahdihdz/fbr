import './styles.css';
import { VideoRepo } from './db/repo';
import { createApp } from './app';
import { el, clear } from './utils/dom';

async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;
  try {
    const base = import.meta.env.BASE_URL;
    await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
  } catch {
    // Service worker là tuỳ chọn; webapp vẫn chạy bình thường khi không có.
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('Không tìm thấy #app');

  try {
    const repo = await VideoRepo.open();
    createApp(root, repo);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'lỗi không xác định';
    clear(root);
    root.appendChild(
      el('div', { class: 'empty-state' }, [
        el('h1', { text: 'Không mở được dữ liệu cục bộ' }),
        el('p', {
          text:
            'Trình duyệt của bạn có thể đang chặn IndexedDB (chế độ riêng tư hoặc chặn cookie). ' +
            `Chi tiết: ${message}`,
        }),
      ]),
    );
  }

  void registerServiceWorker();
}

void boot();
