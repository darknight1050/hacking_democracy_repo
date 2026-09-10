import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { impactPdf } from '../src/server/impact-pdf';
import type { PersonalImpact } from '../src/contracts';

export const sampleImpact: PersonalImpact = {
  username: 'Zürich neighbour',
  generatedAt: '2026-09-10T12:00:00Z',
  algorithm: 'MES + greedy votes-per-CHF completion',
  budget: 10000,
  funded: 9000,
  virtualShare: 100,
  mesContribution: 65,
  projects: Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    title: [
      'A shared music school in Zürich',
      'Accessible garden by the river',
      'Repair café and community workshop',
    ][i % 3],
    district: 'Kreis 4',
    cost: 1200,
    coins: 4,
    votes: 2,
    stage: i % 3 === 0 ? 'mes' : i % 3 === 1 ? 'greedy' : null,
    mesContribution: i % 3 === 0 ? 16.25 : 0,
    deliveryStatus: i % 3 === 0 ? 'completed' : 'not_reported',
    deliveryNote:
      i % 3 === 0
        ? 'The community space has opened. Accessible paths, seating and planting are complete.'
        : '',
    deliveryUpdatedAt: i % 3 === 0 ? '2026-09-10T10:00:00Z' : null,
  })),
};

test('personal impact PDF supports multiple pages and user text', async () => {
  const bytes = await impactPdf({ ...sampleImpact, username: 'Zürich 🎉' });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 3);
  assert.equal(pdf.getTitle(), 'Your personal impact');
  if (process.env.IMPACT_PDF_SAMPLE) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile('.local/personal-impact-sample.pdf', bytes);
  }
});
