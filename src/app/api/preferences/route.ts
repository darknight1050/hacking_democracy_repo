import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/lib/http';
import { participant } from '@/lib/session';
import { districtPreferences, saveDistrictPreferences } from '@/lib/preferences';
export async function GET() {
  return handler(async () =>
    Response.json(await districtPreferences(), {
      headers: { 'Cache-Control': 'private, no-store' },
    }),
  );
}
export async function PUT(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const input = z
      .object({
        districtIds: z.array(z.number().int().positive()).max(100),
        categoryIds: z.array(z.number().int().positive()).max(100).default([]),
      })
      .parse(await readJson(request));
    return Response.json(
      await saveDistrictPreferences(await participant(), input.districtIds, input.categoryIds),
    );
  });
}
