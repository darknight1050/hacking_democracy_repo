import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/server/http';
import { authenticate, currentAccount, logoutAccount } from '@/server/accounts';

export async function GET() {
  return handler(async () => {
    const account = await currentAccount();
    return Response.json(
      { account: account ? { username: account.username } : null },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  });
}
export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const input = z
      .object({
        username: z
          .string()
          .trim()
          .toLowerCase()
          .regex(
            /^[a-z0-9_]{3,40}$/,
            'Use 3–40 letters, numbers or underscores for your username.',
          ),
        password: z.string().min(10, 'Use at least 10 characters for your password.').max(128),
        signup: z.boolean(),
      })
      .parse(await readJson(request));
    const account = await authenticate(input.username, input.password, input.signup);
    return Response.json({ account }, { status: input.signup ? 201 : 200 });
  });
}
export async function DELETE(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    await logoutAccount();
    return Response.json({ ok: true });
  });
}
