// Sinh icon PNG cho PWA, không dùng thư viện ngoài.
// Chạy: npm run gen:icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const lerp = (a, b, t) => a + (b - a) * t;

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function insideTriangle(px, py, a, b, c) {
  const sign = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = sign([px, py], a, b);
  const d2 = sign([px, py], b, c);
  const d3 = sign([px, py], c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function blend(target, index, r, g, b, alpha) {
  const sa = alpha;
  const da = target[index + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) {
    target[index] = 0;
    target[index + 1] = 0;
    target[index + 2] = 0;
    target[index + 3] = 0;
    return;
  }
  target[index] = Math.round((r * sa + target[index] * da * (1 - sa)) / outA);
  target[index + 1] = Math.round((g * sa + target[index + 1] * da * (1 - sa)) / outA);
  target[index + 2] = Math.round((b * sa + target[index + 2] * da * (1 - sa)) / outA);
  target[index + 3] = Math.round(outA * 255);
}

function drawIcon(size, { maskable }) {
  const px = new Uint8Array(size * size * 4);
  const radius = maskable ? 0 : size * 0.22;
  const inset = maskable ? size * 0.12 : 0;
  const left = inset;
  const top = inset;
  const right = size - inset;
  const bottom = size - inset;

  // Nền gradient xanh → tím.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!insideRoundedRect(x + 0.5, y + 0.5, left, top, right, bottom, maskable ? 0 : radius)) continue;
      const t = (x / size + y / size) / 2;
      const r = lerp(24, 124, t);
      const g = lerp(119, 58, t);
      const b = lerp(242, 237, t);
      blend(px, (y * size + x) * 4, r, g, b, 1);
    }
  }

  // Tam giác phát.
  const scale = maskable ? 0.56 : 0.7;
  const cx = size / 2;
  const cy = size * (maskable ? 0.47 : 0.44);
  const s = size * scale;
  const a = [cx - s * 0.28, cy - s * 0.4];
  const b = [cx - s * 0.28, cy + s * 0.4];
  const c = [cx + s * 0.42, cy];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (insideTriangle(x + 0.5, y + 0.5, a, b, c)) {
        blend(px, (y * size + x) * 4, 255, 255, 255, 1);
      }
    }
  }

  // Thanh tiến trình.
  const barLeft = size * (maskable ? 0.26 : 0.2);
  const barRight = size * (maskable ? 0.74 : 0.8);
  const barTop = size * (maskable ? 0.78 : 0.79);
  const barBottom = barTop + size * 0.075;
  const barRadius = (barBottom - barTop) / 2;
  const filledRight = barLeft + (barRight - barLeft) * 0.62;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px1 = x + 0.5;
      const py1 = y + 0.5;
      if (insideRoundedRect(px1, py1, barLeft, barTop, barRight, barBottom, barRadius)) {
        blend(px, (y * size + x) * 4, 255, 255, 255, 0.35);
      }
      if (insideRoundedRect(px1, py1, barLeft, barTop, filledRight, barBottom, barRadius)) {
        blend(px, (y * size + x) * 4, 255, 255, 255, 1);
      }
    }
  }

  return encodePng(size, px);
}

mkdirSync(outDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

for (const target of targets) {
  const png = drawIcon(target.size, { maskable: target.maskable });
  writeFileSync(resolve(outDir, target.file), png);
  console.log(`${target.file}: ${png.length} bytes`);
}
console.log(`Đã ghi ${targets.length} icon vào ${outDir}`);
