import { el } from '../utils/dom';
import { formatClockSec, parseLooseDuration, splitSeconds } from '../utils/time';

export interface TimeFieldOptions {
  legend: string;
  /** Giá trị ban đầu, tính bằng giây. */
  value?: number;
  /** Nếu biết, giá trị sẽ được kẹp không vượt quá mốc này (thường là thời lượng video). */
  maxSeconds?: number;
  showSlider?: boolean;
  hint?: string;
  onChange?: (seconds: number, valid: boolean) => void;
}

export interface TimeField {
  node: HTMLElement;
  getSeconds(): number;
  setSeconds(total: number): void;
  setMaxSeconds(max: number | undefined): void;
  isValid(): boolean;
  message(): string | null;
}

const UNITS = ['hours', 'minutes', 'seconds'] as const;
type Unit = (typeof UNITS)[number];

const UNIT_LABEL: Record<Unit, string> = { hours: 'giờ', minutes: 'phút', seconds: 'giây' };
const UNIT_SHORT: Record<Unit, string> = { hours: 'h', minutes: 'm', seconds: 's' };

function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, '').slice(0, 3);
}

function toNumber(value: string): number {
  const parsed = Number(digitsOnly(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

/**
 * Ô nhập thời gian gồm ba phần giờ / phút / giây.
 *
 * Lý do tồn tại: trên điện thoại, `inputmode="numeric"` chỉ hiện bàn phím số nên
 * người dùng KHÔNG gõ được dấu `:`. Tách thành ba ô số giải quyết triệt để việc
 * đó, đồng thời vẫn nhận dán dạng "1:05:03" hoặc "1h5m3s" vào bất kỳ ô nào.
 */
export function createTimeField(options: TimeFieldOptions): TimeField {
  const maxRef: { value: number | undefined } = { value: options.maxSeconds };
  const inputs = {} as Record<Unit, HTMLInputElement>;

  const echo = el('p', { class: 'timefield__echo' });
  const notice = el('p', { class: 'timefield__echo timefield__echo--notice' });
  const error = el('p', { class: 'timefield__echo timefield__echo--error' });

  const readRaw = (): Record<Unit, number> => ({
    hours: toNumber(inputs.hours.value),
    minutes: toNumber(inputs.minutes.value),
    seconds: toNumber(inputs.seconds.value),
  });

  const rawTotal = (): number => {
    const raw = readRaw();
    return raw.hours * 3600 + raw.minutes * 60 + raw.seconds;
  };

  const isValid = (): boolean => {
    const raw = readRaw();
    return raw.minutes <= 59 && raw.seconds <= 59;
  };

  const getSeconds = (): number => {
    const total = rawTotal();
    if (maxRef.value !== undefined && maxRef.value >= 0 && total > maxRef.value) return maxRef.value;
    return total;
  };

  const message = (): string | null => {
    if (!isValid()) return 'Phút và giây phải nhỏ hơn 60.';
    if (maxRef.value !== undefined && rawTotal() > maxRef.value) {
      return `Dài hơn thời lượng video nên đã kẹp về ${formatClockSec(maxRef.value)}.`;
    }
    return null;
  };

  const slider =
    options.showSlider === true
      ? (el('input', {
          class: 'slider',
          attrs: {
            type: 'range',
            min: '0',
            max: String(Math.max(1, maxRef.value ?? 1)),
            step: '1',
            value: String(getSeconds()),
            'aria-label': 'Kéo để chọn vị trí',
          },
        }) as HTMLInputElement)
      : null;

  const refresh = (): void => {
    const total = rawTotal();
    echo.textContent = total > 0 ? `= ${formatClockSec(total)} · ${total} giây` : 'chưa nhập';

    const msg = message();
    if (msg === null) {
      error.textContent = '';
      error.hidden = true;
      notice.textContent = '';
      notice.hidden = true;
    } else if (!isValid()) {
      error.textContent = msg;
      error.hidden = false;
      notice.textContent = '';
      notice.hidden = true;
    } else {
      error.textContent = '';
      error.hidden = true;
      notice.textContent = msg;
      notice.hidden = false;
    }

    if (slider) {
      slider.max = String(Math.max(1, maxRef.value ?? total));
      slider.value = String(getSeconds());
    }
    options.onChange?.(getSeconds(), isValid());
  };

  const setSeconds = (total: number): void => {
    const parts = splitSeconds(Math.max(0, Math.round(total)));
    inputs.hours.value = parts.hours > 0 ? String(parts.hours) : '';
    inputs.minutes.value = parts.minutes > 0 ? String(parts.minutes) : '';
    inputs.seconds.value = parts.seconds > 0 ? String(parts.seconds) : '';
    refresh();
  };

  const applyLooseText = (text: string): boolean => {
    const parsed = parseLooseDuration(text);
    if (parsed === null) return false;
    setSeconds(parsed);
    return true;
  };

  for (const unit of UNITS) {
    const input = el('input', {
      class: 'input timefield__input',
      attrs: {
        type: 'text',
        inputmode: 'numeric',
        autocomplete: 'off',
        spellcheck: 'false',
        maxlength: '3',
        placeholder: '0',
        'aria-label': `${options.legend} — ${UNIT_LABEL[unit]}`,
      },
      on: {
        input: () => {
          const clean = digitsOnly(input.value);
          if (clean !== input.value) input.value = clean;
          refresh();
        },
        paste: (event) => {
          const text = (event as ClipboardEvent).clipboardData?.getData('text') ?? '';
          if (applyLooseText(text)) event.preventDefault();
        },
        blur: () => {
          refresh();
        },
      },
    }) as HTMLInputElement;
    inputs[unit] = input;
  }

  const quickRow = el('div', { class: 'timefield__quick' });
  const quick = (label: string, apply: () => void): void => {
    quickRow.appendChild(
      el('button', {
        class: 'btn btn--ghost btn--sm',
        text: label,
        attrs: { type: 'button' },
        on: { click: apply },
      }),
    );
  };
  quick('−1 phút', () => setSeconds(Math.max(0, getSeconds() - 60)));
  quick('−10 giây', () => setSeconds(Math.max(0, getSeconds() - 10)));
  quick('+10 giây', () => setSeconds(getSeconds() + 10));
  quick('+1 phút', () => setSeconds(getSeconds() + 60));
  if (options.maxSeconds !== undefined) {
    quick('Cuối video', () => setSeconds(maxRef.value ?? 0));
  }
  quick('Đặt 0', () => setSeconds(0));

  if (slider) {
    slider.addEventListener('input', () => {
      setSeconds(Number(slider.value));
    });
  }

  const row = el('div', { class: 'timefield__row' }, [
    el('div', { class: 'timefield__part' }, [inputs.hours, el('span', { class: 'timefield__unit', text: UNIT_SHORT.hours })]),
    el('span', { class: 'timefield__sep', text: ':' }),
    el('div', { class: 'timefield__part' }, [inputs.minutes, el('span', { class: 'timefield__unit', text: UNIT_SHORT.minutes })]),
    el('span', { class: 'timefield__sep', text: ':' }),
    el('div', { class: 'timefield__part' }, [inputs.seconds, el('span', { class: 'timefield__unit', text: UNIT_SHORT.seconds })]),
  ]);

  const node = el('fieldset', { class: 'timefield' }, [
    el('legend', { class: 'timefield__legend', text: options.legend }),
    row,
    ...(slider ? [slider] : []),
    echo,
    notice,
    error,
    quickRow,
    options.hint ? el('p', { class: 'hint', text: options.hint }) : null,
  ]);

  notice.hidden = true;
  error.hidden = true;
  setSeconds(options.value ?? 0);

  return {
    node,
    getSeconds,
    setSeconds,
    setMaxSeconds(max: number | undefined): void {
      maxRef.value = max;
      refresh();
    },
    isValid,
    message,
  };
}
