import { readFileSync } from 'node:fs';
import * as esbuild from 'esbuild';
import * as THREE from 'three';

const [outfile, ...sources] = process.argv.slice(2);
if (!outfile || sources.length === 0) {
    console.error('usage: node build-three.mjs <outfile> <source files...>');
    process.exit(1);
}

const used = new Set();
for (const file of sources) {
    const code = readFileSync(file, 'utf8');
    const subpath = code.match(/from\s+['"]three\/[^'"]*['"]/);
    if (subpath) throw new Error(`${file}: three のサブパス読み込みは共有版に含められない: ${subpath[0]}`);
    for (const [, name] of code.matchAll(/\bTHREE\.([A-Za-z_$][\w$]*)/g)) used.add(name);
    for (const [, names] of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]three['"]/g)) {
        for (const name of names.split(',')) {
            const imported = name.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0];
            if (imported) used.add(imported);
        }
    }
}

// 型としてだけ参照される名前（THREE.ColorRepresentation など）は実行時に存在しないため除く
const exported = [...used].filter((name) => name in THREE).sort();
if (exported.length === 0) throw new Error('three の参照が 1 つも見つからない');

await esbuild.build({
    stdin: { contents: `export { ${exported.join(', ')} } from 'three';`, resolveDir: import.meta.dirname, loader: 'js' },
    bundle: true,
    format: 'esm',
    minify: true,
    outfile,
    logLevel: 'warning',
});
console.log(`three ${THREE.REVISION}: ${exported.length} exports -> ${outfile}`);
