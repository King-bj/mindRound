/**
 * 构建前将 src/core/personae 复制到 src-tauri/bundle-data/personae，
 * 由 tauri bundle.resources 打入安装包；运行时复制到用户 data/personae（与 embed 二选一优先资源）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const src = path.join(repoRoot, 'src', 'core', 'personae');
const dest = path.join(repoRoot, 'src-tauri', 'bundle-data', 'personae');

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`stage-bundle-data: ${src} -> ${dest}`);
