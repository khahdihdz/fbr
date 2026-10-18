import type { Ctx } from '../app';
import { el } from '../utils/dom';

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: '1. Chưa có dữ liệu vì webapp không đọc được app Facebook',
    body:
      'Trình duyệt bị sandbox: một trang web không thể đọc vị trí phát video của một app native khác. ' +
      'Đây là giới hạn của hệ điều hành, không phải lỗi của webapp.',
  },
  {
    title: '2. Cách nhanh nhất: chia sẻ link từ app Facebook',
    body:
      'Trong app Facebook, bấm Chia sẻ → chọn webapp này (cần cài trước, xem nút bên dưới). ' +
      'Link sẽ rơi vào đây và bạn chỉ cần xác nhận đang xem tới đâu.',
  },
  {
    title: '3. Cách chính xác nhất: nhập file dữ liệu của Facebook',
    body:
      'Facebook cho phép bạn tải "Download your information". Chọn mục video đã xem, tải về rồi vào tab Nhập để đọc file.',
  },
  {
    title: '4. Luôn có phương án thủ công',
    body: 'Dán link hàng loạt, hoặc mở video rồi quay lại đây — webapp sẽ hỏi bạn xem tới đâu.',
  },
];

export function renderOnboarding(container: HTMLElement, ctx: Ctx): void {
  const cards = STEPS.map((step) =>
    el('article', { class: 'onboard__step' }, [
      el('h3', { class: 'onboard__title', text: step.title }),
      el('p', { class: 'onboard__body', text: step.body }),
    ]),
  );

  container.appendChild(
    el('section', { class: 'onboard' }, [
      el('h2', { class: 'section-title', text: 'Bắt đầu theo dõi tiến trình' }),
      el('p', {
        class: 'hint',
        text:
          'Dữ liệu chỉ nằm trong IndexedDB trên thiết bị của bạn. Không có server, không analytics, không telemetry.',
      }),
      ...cards,
      el('div', { class: 'onboard__actions' }, [
        el('a', {
          class: 'btn btn--primary',
          text: 'Cài webapp lên màn hình chính',
          attrs: { href: './install.html' },
        }),
        el('a', {
          class: 'btn',
          text: 'Nhập dữ liệu',
          attrs: { href: '#/import' },
        }),
        el('button', {
          class: 'btn btn--ghost',
          text: 'Xem chẩn đoán',
          attrs: { type: 'button' },
          on: { click: () => ctx.navigate('/probe') },
        }),
      ]),
    ]),
  );
}
