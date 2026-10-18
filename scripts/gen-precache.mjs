// Sau khi `vite build`:
//   1. tính "phiên bản" của bản build (commit SHA trên CI, hash nội dung khi build tay)
//   2. sinh dist/version.json để trang tự phát hiện có bản mới
//   3. chèn phiên bản vào dist/index.html qua thẻ <meta>
//   4. thay token trong dist/sw.js bằng danh sách precache thật
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '../dist');
const base = '/fbr/';
const swPath = join(distDir, 'sw.js');
const versionPath = join(distDir, 'version.json');
const indexPath = join(distDir, 'index.html');

if (!existsSync(swPath)) {
  console.error('Không tìm thấy dist/sw.js. Hãy chạy `vite build` trước.');
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// version.json không được precache (phải luôn đọc từ mạng) và cũng không tính
// vào hash nội dung, vì nó chứa metadata chứ không phải mã chạy.
const files = walk(distDir).filter(
  (file) => file !== swPath && file !== versionPath,
);

const shell = files
  .map((file) => relative(distDir, file).split(sep).join('/'))
  .map((rel) => `${base}${rel}`)
  .sort();

const hash = createHash('sha256');
for (const file of [...files].sort()) {
  hash.update(relative(distDir, file));
  hash.update(readFileSync(file));
}
const contentVersion = hash.digest('hex').slice(0, 12);

const commit = (process.env.GITHUB_SHA ?? '').trim();
const run = (process.env.GITHUB_RUN_NUMBER ?? '').trim();
const builtAt = new Date().toISOString();

// Trên CI, mỗi commit là một phiên bản: nhờ vậy chỉ cần push commit mới là mọi
// thiết bị đang mở webapp phát hiện được bản mới. Khi build tay thì dùng hash.
const version = commit ? commit.slice(0, 7) : contentVersion;

const info = {
  version,
  commit: commit || null,
  run: run || null,
  content: contentVersion,
  builtAt,
};
writeFileSync(versionPath, `${JSON.stringify(info, null, 2)}\n`);

if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8');
  const next = html
    .replace('__FBR_VERSION__', version)
    .replace('__FBR_COMMIT__', commit || '')
    .replace('__FBR_BUILT__', builtAt);
  if (next === html && !html.includes(version)) {
    console.warn('Cảnh báo: không thấy token __FBR_VERSION__ trong dist/index.html.');
  } else {
    writeFileSync(indexPath, next);
  }
}

const source = readFileSync(swPath, 'utf8');
const list = shell.map((url) => `  '${url}',`).join('\n');
const next = source
  .replace('__FBR_VERSION__', version)
  .replace('/* __FBR_PRECACHE__ */', `\n${list}\n`);

if (!next.includes(version)) {
  console.error('Không thay được token version trong sw.js.');
  process.exit(1);
}

writeFileSync(swPath, next);
console.log(
  `sw.js: version ${version}${commit ? ` (commit ${commit.slice(0, 7)})` : ''}, precache ${shell.length} file`,
);
console.log(`version.json: ${JSON.stringify(info)}`);
