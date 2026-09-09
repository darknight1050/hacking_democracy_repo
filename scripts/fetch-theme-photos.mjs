// Curated subject pages, with Commons attribution retained for every district image.
import { mkdir, writeFile } from 'node:fs/promises';
const titles = [
  'Jewellery',
  'Stonemasonry',
  'Printed circuit board',
  'Fishing vessel',
  'Electric power transmission',
  'Passenger train',
  'Lumber',
  'Textile',
  'Wheat',
  'Cattle',
  'Orchard',
  'Coal mining',
  'City',
];
const headers = { 'User-Agent': 'CommonGroundDev/1.0 (district-themed demo assets)' };
async function get(url) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Image metadata failed: ${r.status}`);
  return r.json();
}
const pages = Object.values(
  (
    await get(
      'https://en.wikipedia.org/w/api.php?' +
        new URLSearchParams({
          action: 'query',
          titles: titles.join('|'),
          prop: 'pageimages',
          piprop: 'original|name',
          redirects: '1',
          format: 'json',
        }),
    )
  ).query.pages,
);
const files = Object.values(
  (
    await get(
      'https://commons.wikimedia.org/w/api.php?' +
        new URLSearchParams({
          action: 'query',
          titles: pages.map((p) => 'File:' + p.pageimage).join('|'),
          prop: 'imageinfo',
          iiprop: 'url|extmetadata',
          iiurlwidth: '960',
          format: 'json',
        }),
    )
  ).query.pages,
);
const plain = (value) =>
  (value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
const photos = titles.map((title, index) => {
  const page = pages.find((p) => p.title === title);
  const file = files.find(
    (f) => f.title.replaceAll('_', ' ') === ('File:' + page.pageimage).replaceAll('_', ' '),
  );
  const info = file?.imageinfo?.[0];
  if (!info) throw new Error(`No Commons photo for ${title}`);
  const meta = info.extmetadata;
  return {
    district: index + 1,
    subject: title,
    image: info.thumburl ?? info.url,
    source: info.descriptionurl,
    credit: `${plain(meta.Artist?.value).slice(0, 200) || 'Wikimedia Commons'} · ${plain(meta.LicenseShortName?.value)}`,
    license: meta.LicenseUrl?.value ?? info.descriptionurl,
  };
});
await mkdir('db/fixtures', { recursive: true });
await writeFile('db/fixtures/district-photos.json', JSON.stringify(photos, null, 2) + '\n');
console.log(`Saved ${photos.length} subject-matched image URLs and credits.`);
