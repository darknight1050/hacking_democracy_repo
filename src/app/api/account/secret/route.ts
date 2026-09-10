import { handler, sameOrigin } from '@/server/http';
import { requireAccount } from '@/server/accounts';
import { unlockSecretAchievement } from '@/server/services/achievements';

export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    await unlockSecretAchievement((await requireAccount()).id);
    return Response.json({ unlocked: true });
  });
}
