import { handler, sameOrigin } from '@/lib/http';
import { participant } from '@/lib/session';
import { nextBallot } from '@/lib/services';
import { districtPreferences } from '@/lib/preferences';
export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const preferences = await districtPreferences();
    return Response.json(
      await nextBallot(
        await participant(),
        preferences.districtIds,
        undefined,
        preferences.categoryIds,
      ),
    );
  });
}
