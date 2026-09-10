// Retrieve subject-specific Commons photographs, keeping their source and licence.
import { projects } from '../db/fixtures/zurich-projects.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const headers = { 'User-Agent': 'CommonGroundDev/1.0 (participatory-budget demo; educational)' };
// Reviewed replacements where an article's lead image does not depict the proposed equipment.
const overrides = {
  6: 'File:Schwegler Bat Box 2FN Chanteraines.jpg',
  13: 'File:Modern Sewing Machine (15453886961).jpg',
  24: 'File:Garden compost bin.jpg',
  28: 'File:Garden patio umbrella.jpg',
  29: 'File:Kledingruil kledingrek.jpg',
  12: 'File:Wiki Loves Arts mural painting at Manapao Elementary School 05.jpg',
  15: 'File:Century Tent with Dance Floor and Stage.JPG',
  43: 'File:Station worker with portable wheelchair ramp and wheelchair user - Tokyo - Akihabara stn Sep 20 2019 02-13PM.jpeg',
  36: 'File:Little gymnasts on beam.jpg',
};
async function get(url) {
  let response;
  for (let attempt = 0; attempt < 4; attempt++) {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (response.status !== 429) break;
    console.log('Wikimedia rate limit: waiting before retry.');
    await delay(15000 * (attempt + 1));
  }
  if (!response.ok) throw new Error(`Metadata request failed: ${response.status}`);
  return response.json();
}
const query = (host, params) =>
  get(
    `https://${host}/w/api.php?` +
      new URLSearchParams({ action: 'query', format: 'json', ...params }),
  );
const plain = (value) =>
  (value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
let cached = [];
try {
  cached = JSON.parse(await readFile('db/fixtures/zurich-photos.json', 'utf8'));
} catch {}
const photos = cached.filter(
  (photo) =>
    projects.some((p) => p.key === photo.key && p.subject === photo.subject) &&
    (!overrides[photo.key] || photo.file === overrides[photo.key]),
);
const missing = projects.filter((p) => !photos.some((photo) => photo.key === p.key));
for (let start = 0; start < missing.length; start += 10) {
  const batch = missing.slice(start, start + 10);
  const result = await query('en.wikipedia.org', {
    titles: batch.map((p) => p.subject).join('|'),
    prop: 'pageimages',
    piprop: 'original|name',
    redirects: '1',
  });
  const aliases = new Map(
    [...(result.query.normalized ?? []), ...(result.query.redirects ?? [])].map((r) => [
      r.from,
      r.to,
    ]),
  );
  const pages = Object.values(result.query.pages);
  const names = [
    ...pages.filter((p) => p.pageimage).map((p) => 'File:' + p.pageimage),
    ...batch.map((p) => overrides[p.key]).filter(Boolean),
  ];
  const files = names.length
    ? Object.values(
        (
          await query('commons.wikimedia.org', {
            titles: names.join('|'),
            prop: 'imageinfo',
            iiprop: 'url|extmetadata',
            iiurlwidth: '640',
          })
        ).query.pages,
      )
    : [];
  for (const project of batch) {
    let title = project.subject;
    while (aliases.has(title)) title = aliases.get(title);
    const page = pages.find((p) => p.title === title);
    const file = files.find(
      (f) =>
        f.title.replaceAll('_', ' ') ===
        (overrides[project.key] ?? 'File:' + page?.pageimage).replaceAll('_', ' '),
    );
    const info = file?.imageinfo?.[0];
    if (!info) {
      console.log(`Missing image: ${project.key} ${project.subject}`);
      continue;
    }
    const meta = info.extmetadata;
    photos.push({
      key: project.key,
      subject: project.subject,
      file: file.title,
      image: info.thumburl ?? info.url,
      source: info.descriptionurl,
      credit: `${plain(meta.Artist?.value).slice(0, 200) || 'Wikimedia Commons'} · ${plain(meta.LicenseShortName?.value)}`,
      license: meta.LicenseUrl?.value ?? info.descriptionurl,
    });
  }
  console.log(`Resolved ${photos.length} project images.`);
}
await mkdir('db/fixtures', { recursive: true });
await writeFile(
  'db/fixtures/zurich-photos.json',
  JSON.stringify(
    photos.sort((a, b) => a.key - b.key),
    null,
    2,
  ) + '\n',
);
