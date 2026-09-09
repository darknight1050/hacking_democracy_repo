import { handler, sameOrigin } from '@/server/http';
import { participant } from '@/server/session';
import { nextBallot } from '@/server/services/ballots';
import { districtPreferences } from '@/server/preferences';
export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const owner = await participant();
    const preferences = await districtPreferences();
    return Response.json(
      await nextBallot(owner, preferences.districtIds, undefined, preferences.categoryIds),
    );
  });
}
