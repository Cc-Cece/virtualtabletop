import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';

const tag = process.argv[2];
const dest = process.argv[3] ?? 'library/games/Sanguosha-Manual';
const packageName = 'Sanguosha-Manual-4-12P.vtt';
const sourceRepo = process.env.SANGUOSHA_REPO ?? 'Cc-Cece/sanguosha-manual-vtt';

if (!tag) {
  console.error('usage: node scripts/import-sanguosha-library.mjs <tag> [dest]');
  process.exit(1);
}

function assetId(data) {
  return `${crc32(data) | 0}_${data.byteLength}`;
}

async function walkFiles(dir, acc = []) {
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    if ((await stat(path)).isDirectory()) await walkFiles(path, acc);
    else acc.push(path);
  }
  return acc;
}

const work = join(tmpdir(), `sanguosha-library-${process.pid}`);
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });

const url = `https://github.com/${sourceRepo}/releases/download/${encodeURIComponent(tag)}/${packageName}`;
const response = await fetch(url);
if (!response.ok) throw new Error(`download ${url} failed: ${response.status} ${await response.text()}`);
const zipPath = join(work, packageName);
await pipeline(Readable.fromWeb(response.body), createWriteStream(zipPath));

const unpacked = join(work, 'unpacked');
await mkdir(unpacked, { recursive: true });
execFileSync('unzip', ['-o', zipPath, '-d', unpacked], { stdio: 'inherit' });

const game = JSON.parse(await readFile(join(unpacked, '0.json'), 'utf8'));
const line = `货架同步：sanguosha-manual-vtt ${tag}`;
if (game._meta?.info) {
  const current = game._meta.info.attribution ?? '';
  if (!current.includes(line)) {
    game._meta.info.attribution = current ? `${current}\n${line}` : line;
  }
}

await rm(dest, { recursive: true, force: true });
await mkdir(join(dest, 'assets'), { recursive: true });
await writeFile(join(dest, '0.json'), `${JSON.stringify(game, null, 2)}\n`);

let count = 0;
for (const file of await walkFiles(join(unpacked, 'assets'))) {
  const buf = await readFile(file);
  await writeFile(join(dest, 'assets', assetId(buf)), buf);
  count += 1;
}

await rm(work, { recursive: true, force: true });
console.log(`Imported ${dest} (${count} assets) from ${tag}.`);
