import { z } from 'zod';
import { handler } from '@/server/http';
import { mapProjects } from '@/server/services/map-projects';
export async function GET(request: Request) {
  return handler(async () => {
    const params = new URL(request.url).searchParams;
    const id = z.coerce.number().int().positive().max(2147483647).optional();
    return Response.json(
      await mapProjects(
        id.parse(params.get('district')?.trim() || undefined),
        id.parse(params.get('category')?.trim() || undefined),
        z
          .string()
          .trim()
          .max(100)
          .parse(params.get('search') ?? ''),
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
