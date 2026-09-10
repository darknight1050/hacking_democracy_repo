import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PersonalImpact } from '@/contracts';

/** A printable snapshot of the same private report shown in the account. */
export async function impactPdf(report: PersonalImpact): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(path.join(process.cwd(), 'src/server/pdf-assets/Vera.ttf')),
  );
  const bold = await pdf.embedFont(
    await readFile(path.join(process.cwd(), 'src/server/pdf-assets/VeraBd.ttf')),
  );
  const supported = new Set(font.getCharacterSet());
  const clean = (s: string) =>
    [...s].map((c) => (supported.has(c.codePointAt(0)!) ? c : '?')).join('');
  const money = (n: number) =>
    `CHF ${n.toLocaleString('en-CH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  function line(text: string, size = 11, strong = false) {
    const face = strong ? bold : font;
    let current = '';
    for (const word of clean(text).split(/\s+/)) {
      if (current && face.widthOfTextAtSize(current + ' ' + word, size) > 495) {
        draw(current);
        current = '';
      }
      // Split only exceptionally long words; ordinary prose wraps at spaces.
      for (const character of (current ? ' ' : '') + word) {
        if (face.widthOfTextAtSize(current + character, size) > 495) {
          draw(current);
          current = '';
        }
        current += character;
      }
    }
    if (current) draw(current);
    y -= 7;
    function draw(value: string) {
      if (y < 65) {
        page = pdf.addPage([595.28, 841.89]);
        y = 790;
      }
      page.drawText(value, { x: 50, y, size, font: face, color: rgb(0.12, 0.18, 0.23) });
      y -= size * 1.45;
    }
  }
  pdf.setTitle('Your personal impact');
  line('Your personal impact', 24, true);
  line(`${report.username} | ${new Date(report.generatedAt).toISOString().slice(0, 10)}`);
  line(report.algorithm, 12, true);
  line(
    `Community budget: ${money(report.budget)} | Selected project costs: ${money(report.funded)}`,
  );
  line(
    `${report.projects.reduce((n, p) => n + p.coins, 0)} confirmed coins | ${report.projects.filter((p) => p.stage).length} supported winners`,
  );
  line(`Your equal virtual budget share: ${money(report.virtualShare)}`);
  line(`Your MES contribution: ${money(report.mesContribution)}`);
  line(
    'Coins are voting credits, not money paid. MES contributions are virtual budget-share payments. Greedy additions use the pooled remainder and have no individual CHF attribution. Project costs are estimates, not actual expenditure.',
  );
  line('Your confirmed allocations', 17, true);
  if (!report.projects.length) line('You have no confirmed allocations in this round.');
  for (const p of report.projects) {
    if (y < 180) {
      page = pdf.addPage([595.28, 841.89]);
      y = 790;
    }
    line(p.title, 14, true);
    line(`${p.district} | Estimated cost: ${money(p.cost)}`);
    line(
      `${p.coins} coins = ${p.votes} votes | ${p.stage === 'mes' ? 'Selected by MES' : p.stage === 'greedy' ? 'Selected by greedy completion' : 'Not selected'}`,
    );
    if (p.stage === 'mes') line(`Your MES contribution: ${money(p.mesContribution)}`);
    if (p.stage) {
      const labels = {
        not_reported: 'No delivery update reported',
        planned: 'Planning',
        in_progress: 'In progress',
        completed: 'Completed',
        cancelled: 'Cancelled',
      };
      line(`Delivery: ${labels[p.deliveryStatus]}`);
      if (p.deliveryNote) line(p.deliveryNote);
      if (p.deliveryUpdatedAt)
        line(`Admin update: ${new Date(p.deliveryUpdatedAt).toISOString().slice(0, 10)}`, 9);
    }
    y -= 10;
  }
  line(
    'Funding selection does not prove implementation. Delivery statuses are recorded by administrators. This report reflects the published results and delivery records at export time.',
    9,
  );
  pdf
    .getPages()
    .forEach((p, i) =>
      p.drawText(`Personal impact | ${i + 1} / ${pdf.getPageCount()}`, {
        x: 50,
        y: 30,
        size: 9,
        font,
      }),
    );
  return pdf.save();
}
