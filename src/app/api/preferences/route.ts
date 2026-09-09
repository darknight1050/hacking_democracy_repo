import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/server/http';
import { participant } from '@/server/session';
import { districtPreferences, saveDistrictPreferences } from '@/server/preferences';
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
    const owner = await participant();
    const input = z
      .object({
        districtIds: z.array(z.number().int().positive()).max(100),
        categoryIds: z.array(z.number().int().positive()).max(100).default([]),
      })
      .parse(await readJson(request));
    return Response.json(
      await saveDistrictPreferences(owner, input.districtIds, input.categoryIds),
    );
  });
}
