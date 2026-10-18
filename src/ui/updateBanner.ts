import { el } from '../utils/dom';
import { shortVersion, type VersionInfo } from '../pwa/version';

export interface UpdateBanner {
  node: HTMLElement;
  show(info: VersionInfo): void;
  hide(): void;
  visible(): boolean;
}

/**
 * Thanh thông báo "có bản mới" nằm ngay trên thanh điều hướng.
 *
 * Cố tình KHÔNG tự tải lại trang: người dùng có thể đang nhập dở thời gian
 * của một video. Họ bấm "Cập nhật" khi thấy tiện, hoặc để sau.
 */
export function createUpdateBanner(onApply: () => void): UpdateBanner {
  const label = el('p', { class: 'updatebar__text' });
  const apply = el('button', {
    class: 'btn btn--primary btn--sm updatebar__apply',
    text: 'Cập nhật',
    attrs: { type: 'button' },
    on: { click: () => onApply() },
  });
  const dismiss = el('button', {
    class: 'btn btn--ghost btn--sm',
    text: 'Để sau',
    attrs: { type: 'button' },
    on: { click: () => hide() },
  });

  const node = el(
    'div',
    {
      class: 'updatebar',
      attrs: { role: 'status', 'aria-live': 'polite', hidden: true },
    },
    [label, el('div', { class: 'updatebar__actions' }, [apply, dismiss])],
  );

  function hide(): void {
    node.hidden = true;
  }

  function show(info: VersionInfo): void {
    const version = shortVersion(info.version);
    const built = info.builtAt ? new Date(info.builtAt) : null;
    const when =
      built && !Number.isNaN(built.getTime())
        ? ` (${built.toLocaleDateString('vi-VN')})`
        : '';
    label.textContent = `Đã có bản mới ${version}${when}. Tải lại để cập nhật.`;
    node.hidden = false;
  }

  return {
    node,
    show,
    hide,
    visible: () => !node.hidden,
  };
}
