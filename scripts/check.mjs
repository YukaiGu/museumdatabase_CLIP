import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const project = new URL('../', import.meta.url);
const html = await readFile(new URL('dist/index.html', project), 'utf8');
for (const [, relative] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) await access(new URL(relative, new URL('dist/', project)));
for (const file of ['dist/app.js', 'dist/catalog.js', 'scripts/serve.mjs', 'server/multilingual.js', 'server/query-expansion.js', 'server/hosting.js', 'server/embeddings.js', 'server/remote.js', 'server/sources.js', 'server/japanese-metadata.js', 'server/asian-sources.js', 'server/search.js']) execFileSync(process.execPath, ['--check', fileURLToPath(new URL(file, project))], { stdio: 'inherit' });
console.log('Local assets and JavaScript syntax verified.');
