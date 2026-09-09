import { handler, sameOrigin } from '@/server/http';
import { participant } from '@/server/session';
import { nextBallot } from '@/server/services/ballots';
import { districtPreferences } from '@/server/preferences';
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
