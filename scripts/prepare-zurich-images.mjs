// Cache real project photographs as WebP before any database changes. No runtime hotlinks.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { setTimeout as delay } from 'node:timers/promises';
import { projects } from '../db/fixtures/zurich-projects.mjs';
const photos = JSON.parse(await readFile('db/fixtures/zurich-photos.json', 'utf8'));
if (photos.length !== 50 || new Set(photos.map((p) => p.source)).size !== 50)
  throw new Error('Exactly 50 distinct attributed photographs are required.');
await mkdir('.local/zurich-images', { recursive: true });
const hashes = new Set();
const tiles = [];
const refresh = new Set(
  (process.argv.find((a) => a.startsWith('--refresh='))?.split('=')[1] ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number),
);
for (const project of projects) {
  const photo = photos.find((p) => p.key === project.key);
  const path = `.local/zurich-images/${project.key}.webp`;
  let bytes;
  try {
    if (refresh.has(project.key)) throw new Error('Refresh requested.');
    bytes = await readFile(path);
  } catch {
    let response;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(photo.image, {
        headers: { 'User-Agent': 'CommonGroundDev/1.0 (educational project mockups)' },
        signal: AbortSignal.timeout(30000),
      });
      if (response.status !== 429) break;
      const seconds = Math.max(
        20 * (attempt + 1),
        Number(response.headers.get('retry-after')) || 0,
      );
      console.log(`Photo ${project.key}: waiting ${seconds}s for Wikimedia rate limit.`);
      await delay(seconds * 1000);
    }
    if (!response.ok) throw new Error(`Photo ${project.key}: HTTP ${response.status}`);
    bytes = await sharp(Buffer.from(await response.arrayBuffer()))
      .rotate()
      .resize(960, 640, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    await writeFile(path, bytes);
    await delay(1500);
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hashes.has(hash)) throw new Error(`Duplicate photograph: ${project.key}`);
  hashes.add(hash);
  const label = `${project.key}: ${project.subject}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;');
  const tile = await sharp(bytes)
    .resize(250, 155, { fit: 'contain', background: '#eeeeee' })
    .extend({ bottom: 30, background: 'white' })
    .composite([
      {
        input: Buffer.from(
          `<svg width="250" height="185"><text x="8" y="176" font-family="sans-serif" font-size="12">${label}</text></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer();
  tiles.push({
    input: tile,
    left: (project.key % 5) * 250,
    top: Math.floor(project.key / 5) * 185,
  });
  console.log(`Prepared ${project.key + 1}/50: ${project.subject}`);
}
await sharp({ create: { width: 1250, height: 1850, channels: 3, background: 'white' } })
  .composite(tiles)
  .png()
  .toFile('.local/zurich-images/contact-sheet.png');
console.log('All 50 unique project images are ready.');
