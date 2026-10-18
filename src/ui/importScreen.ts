import type { Ctx } from '../app';
import type { VideoProgress } from '../types';
import { MAX_RECORDS } from '../types';
import { mergeMany, type MergeSummary } from '../progress/merge';
import { parseFbrExport } from '../import/fbrJson';
import { dyiItemToVideo, findWatchHistoryCandidates } from '../import/fbDyi';
import { videosFromUrlText } from '../import/urls';
import { el, clear, toast, confirmAction, openSheet } from '../utils/dom';
import { formatNumber } from '../utils/format';

/** Gộp vào DB và trả về tóm tắt. */
export async function applyImport(incoming: VideoProgress[], ctx: Ctx, label: string): Promise<MergeSummary> {
  const existing = await ctx.repo.all();
  const summary = mergeMany(existing, incoming);
  await ctx.repo.putMany(summary.videos);

  const overflow = await ctx.repo.overflow(MAX_RECORDS);
  let pruned = 0;
  if (overflow > 0) {
    const ok = await confirmAction(
      `Bạn có ${overflow} bản ghi vượt giới hạn ${formatNumber(MAX_RECORDS)}. Xoá những bản cũ nhất để tiếp tục?`,
      'Xoá bản cũ',
    );
    if (ok) {
      const result = await ctx.repo.prune(MAX_RECORDS);
      pruned = result.removed;
      toast(`Đã xoá ${pruned} bản ghi cũ nhất.`, 'info');
    }
  }

  ctx.probe.log('import_applied', {
    label,
    added: summary.added,
    updated: summary.updated,
    skipped: summary.skipped,
    pruned,
  });
  toast(
    `${label}: thêm ${summary.added}, cập nhật ${summary.updated}, bỏ qua ${summary.skipped}.`,
    'success',
  );
  ctx.refresh();
  return summary;
}

function previewSheet(
  title: string,
  videos: VideoProgress[],
  warnings: string[],
  ctx: Ctx,
  label: string,
): void {
  const preview = videos.slice(0, 8);
  openSheet({
    title,
    description: `Đọc được ${formatNumber(videos.length)} bản ghi.`,
    body: [
      ...(warnings.length > 0
        ? [el('ul', { class: 'warnlist' }, warnings.map((w) => el('li', { text: w })))]
        : []),
      el(
        'ul',
        { class: 'previewlist' },
        preview.map((video) =>
          el('li', {
            text: `${video.title} — ${video.url || video.id}`,
          }),
        ),
      ),
      videos.length > preview.length
        ? el('p', { class: 'hint', text: `… và ${formatNumber(videos.length - preview.length)} bản ghi khác.` })
        : null,
      el('p', { class: 'hint', text: 'Chưa có gì được lưu. Bấm "Gộp vào dữ liệu" để xác nhận.' }),
    ],
    actions: [
      {
        label: 'Gộp vào dữ liệu',
        kind: 'primary',
        onClick: (close) => {
          close();
          void applyImport(videos, ctx, label);
        },
      },
      { label: 'Huỷ', kind: 'ghost', onClick: (close) => close() },
    ],
  });
}

function errorSheet(title: string, errors: string[], warnings: string[]): void {
  openSheet({
    title,
    description: 'Không có gì được nhập.',
    body: [
      el('ul', { class: 'warnlist' }, errors.map((e) => el('li', { text: e }))),
      ...(warnings.length > 0
        ? [el('ul', { class: 'previewlist' }, warnings.map((w) => el('li', { text: w })))]
        : []),
    ],
    actions: [{ label: 'Đóng', kind: 'primary', onClick: (close) => close() }],
  });
}

async function readFiles(files: FileList | File[]): Promise<Array<{ name: string; text: string }>> {
  const list = Array.from(files);
  const out: Array<{ name: string; text: string }> = [];
  for (const file of list) {
    out.push({ name: file.name, text: await file.text() });
  }
  return out;
}

export async function renderImport(container: HTMLElement, ctx: Ctx): Promise<void> {
  clear(container);

  const dyiInput = el('input', {
    class: 'input',
    attrs: { type: 'file', accept: '.json,application/json', multiple: true, 'aria-label': 'Chọn file export Facebook' },
  }) as HTMLInputElement;

  const dyiPreviewHost = el('div', { class: 'mount' });

  const dyiButton = el('button', {
    class: 'btn btn--primary',
    text: 'Đọc file Facebook',
    attrs: { type: 'button' },
    on: {
      click: () => {
        void (async () => {
          const files = dyiInput.files;
          if (!files || files.length === 0) {
            toast('Chưa chọn file nào.', 'error');
            return;
          }
          const contents = await readFiles(files);
          const videos: VideoProgress[] = [];
          const warnings: string[] = [];
          const roots: string[] = [];

          for (const file of contents) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(file.text);
            } catch {
              warnings.push(`${file.name}: không phải JSON hợp lệ, đã bỏ qua.`);
              continue;
            }
            const candidates = findWatchHistoryCandidates(parsed, 8);
            if (candidates.length === 0) {
              warnings.push(`${file.name}: không nhận diện được cấu trúc lịch sử xem video.`);
              continue;
            }
            for (const candidate of candidates) {
              roots.push(`${file.name} → ${candidate.path || '(gốc)'} (điểm ${candidate.score})`);
              for (const item of candidate.items) {
                const video = dyiItemToVideo(item, ctx.now());
                if (video) videos.push(video);
              }
            }
          }

          const deduped = new Map<string, VideoProgress>();
          for (const video of videos) if (!deduped.has(video.id)) deduped.set(video.id, video);
          const unique = [...deduped.values()];

          clear(dyiPreviewHost);
          dyiPreviewHost.appendChild(
            el('p', {
              class: 'hint',
              text: `Đọc được ${formatNumber(unique.length)} bản ghi từ ${contents.length} file.`,
            }),
          );

          ctx.probe.log('dyi_read', { files: contents.length, videos: unique.length, roots });

          if (unique.length === 0) {
            errorSheet(
              'Không đọc được lịch sử xem video',
              [
                'Cấu trúc file không khớp với những dạng mình nhận diện được.',
                'Hãy chắc chắn bạn đã chọn mục video đã xem khi yêu cầu dữ liệu từ Facebook, và file ở định dạng JSON.',
                'Bạn có thể mở tab Chẩn đoán (#/probe) và tải log để gửi lại.',
              ],
              [...warnings, ...roots.slice(0, 8)],
            );
            return;
          }

          previewSheet('Dữ liệu từ Facebook', unique, warnings, ctx, 'Facebook export');
        })();
      },
    },
  }) as HTMLButtonElement;

  const fbrInput = el('input', {
    class: 'input',
    attrs: { type: 'file', accept: '.json,application/json', 'aria-label': 'Chọn file fbr.progress.v1' },
  }) as HTMLInputElement;

  const fbrPaste = el('textarea', {
    class: 'input input--area',
    attrs: { rows: '5', placeholder: 'Hoặc dán JSON vào đây…', 'aria-label': 'Dán JSON' },
  }) as HTMLTextAreaElement;

  const fbrButton = el('button', {
    class: 'btn btn--primary',
    text: 'Đọc dữ liệu fbr',
    attrs: { type: 'button' },
    on: {
      click: () => {
        void (async () => {
          let text = fbrPaste.value.trim();
          if (!text && fbrInput.files && fbrInput.files.length > 0) {
            const contents = await readFiles(fbrInput.files);
            text = contents.map((c) => c.text).join('\n');
          }
          if (!text) {
            toast('Chưa có nội dung để đọc.', 'error');
            return;
          }
          const result = parseFbrExport(text);
          ctx.probe.log('fbr_import', { ok: result.ok, count: result.value.length });
          if (!result.ok || result.value.length === 0) {
            errorSheet('Dữ liệu fbr không hợp lệ', result.errors.concat(result.warnings), []);
            return;
          }
          previewSheet('Dữ liệu fbr', result.value, result.warnings, ctx, 'File fbr');
        })();
      },
    },
  }) as HTMLButtonElement;

  const linksArea = el('textarea', {
    class: 'input input--area',
    attrs: {
      rows: '6',
      placeholder: 'Mỗi dòng một link Facebook, hoặc dán cả đoạn văn lẫn link…',
      'aria-label': 'Danh sách link',
    },
  }) as HTMLTextAreaElement;

  const linksButton = el('button', {
    class: 'btn btn--primary',
    text: 'Thêm link',
    attrs: { type: 'button' },
    on: {
      click: () => {
        const text = linksArea.value.trim();
        if (!text) {
          toast('Chưa có link nào.', 'error');
          return;
        }
        const result = videosFromUrlText(text, { now: ctx.now(), tags: ['link'] });
        ctx.probe.log('link_paste', { count: result.videos.length, skipped: result.skipped.length });
        if (result.videos.length === 0) {
          errorSheet('Không đọc được link Facebook nào', ['Kiểm tra lại định dạng link.'], result.skipped.slice(0, 8));
          return;
        }
        const warnings: string[] = [];
        if (result.skipped.length > 0) warnings.push(`Bỏ qua ${result.skipped.length} dòng không nhận diện được.`);
        if (result.duplicates > 0) warnings.push(`Bỏ qua ${result.duplicates} link trùng.`);
        previewSheet('Link đã dán', result.videos, warnings, ctx, 'Link dán');
      },
    },
  }) as HTMLButtonElement;

  const dropzone = el('div', {
    class: 'dropzone',
    text: 'Kéo thả file JSON vào đây để thử đọc như dữ liệu Facebook',
    attrs: { tabindex: '0', role: 'button' },
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dropzone--active');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dropzone--active'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dropzone--active');
    const files = (event as DragEvent).dataTransfer?.files;
    if (!files || files.length === 0) return;
    void (async () => {
      const contents = await readFiles(files);
      const videos: VideoProgress[] = [];
      const warnings: string[] = [];
      for (const file of contents) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(file.text);
        } catch {
          warnings.push(`${file.name}: không phải JSON hợp lệ.`);
          continue;
        }
        const candidates = findWatchHistoryCandidates(parsed, 8);
        if (candidates.length === 0) {
          warnings.push(`${file.name}: không nhận diện được cấu trúc.`);
          continue;
        }
        for (const candidate of candidates) {
          for (const item of candidate.items) {
            const video = dyiItemToVideo(item, ctx.now());
            if (video) videos.push(video);
          }
        }
      }
      if (videos.length === 0) {
        errorSheet('Không đọc được dữ liệu', ['Không nhận diện được cấu trúc trong file đã thả.'], warnings);
        return;
      }
      previewSheet('Dữ liệu thả vào', videos, warnings, ctx, 'Kéo thả');
    })();
  });

  container.appendChild(el('h2', { class: 'section-title', text: 'Nhập dữ liệu' }));
  container.appendChild(
    el('p', {
      class: 'hint',
      text: 'Mọi thứ được xử lý ngay trên máy bạn. Không có file nào được tải lên server.',
    }),
  );

  container.appendChild(
    el('section', { class: 'panel' }, [
      el('h3', { class: 'panel__title', text: '1. Từ Facebook — "Download your information"' }),
      el('ol', { class: 'steps' }, [
        el('li', { text: 'Facebook → Cài đặt & quyền riêng tư → Thông tin của bạn → Tải thông tin của bạn.' }),
        el('li', { text: 'Chọn "Video đã xem" / "Video watch history", định dạng JSON, rồi tải về.' }),
        el('li', { text: 'Chọn đúng file JSON bên dưới (ví dụ your_video_watch_history.json).' }),
      ]),
      dyiInput,
      el('div', { class: 'panel__actions' }, [dyiButton]),
      dyiPreviewHost,
      dropzone,
    ]),
  );

  container.appendChild(
    el('section', { class: 'panel' }, [
      el('h3', { class: 'panel__title', text: '2. Từ file sao lưu fbr.progress.v1' }),
      el('p', { class: 'hint', text: 'Dùng file export của chính webapp này để chuyển dữ liệu sang máy khác.' }),
      fbrInput,
      fbrPaste,
      el('div', { class: 'panel__actions' }, [fbrButton]),
    ]),
  );

  container.appendChild(
    el('section', { class: 'panel' }, [
      el('h3', { class: 'panel__title', text: '3. Dán link hàng loạt' }),
      el('p', { class: 'hint', text: 'Các link sẽ vào tab "Cần rà lại" cho tới khi bạn nhập thời lượng.' }),
      linksArea,
      el('div', { class: 'panel__actions' }, [linksButton]),
    ]),
  );
}
