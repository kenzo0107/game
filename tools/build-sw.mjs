import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const siteDir = process.argv[2];
if (!siteDir) {
    console.error('usage: node build-sw.mjs <site dir>');
    process.exit(1);
}

const IGNORED = new Set(['sw.js', '.nojekyll']);
const files = readdirSync(siteDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(siteDir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter((path) => !IGNORED.has(path))
    .sort();
if (files.length === 0) throw new Error(`${siteDir} にファイルがない`);

const hash = createHash('sha256');
for (const path of files) hash.update(path).update(readFileSync(join(siteDir, path)));
const version = hash.digest('hex').slice(0, 12);

// ページはディレクトリの URL（bowling/）で開かれるため、index.html はその URL で登録する
const urls = files.map((path) => (path === 'index.html' ? './' : path.replace(/\/index\.html$/, '/')));

const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');
writeFileSync(join(siteDir, 'sw.js'), template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(urls, null, 4)));
console.log(`sw.js: version ${version}, ${urls.length} files`);
