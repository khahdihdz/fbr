// Sau khi `vite build`, thay hai token trong dist/sw.js bằng danh sách precache
// thật (tên file asset có hash chỉ biết được ở bước này).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '../dist');
const base = '/fbr/';
const swPath = join(distDir, 'sw.js');

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

const files = walk(distDir).filter((file) => file !== swPath);

const shell = files
  .map((file) => relative(distDir, file).split(sep).join('/'))
  .map((rel) => `${base}${rel}`)
  .sort();

const hash = createHash('sha256');
for (const file of files.sort()) {
  hash.update(relative(distDir, file));
  hash.update(readFileSync(file));
}
const version = hash.digest('hex').slice(0, 12);

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
console.log(`sw.js: version ${version}, precache ${shell.length} file`);
