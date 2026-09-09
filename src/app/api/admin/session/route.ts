import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/server/http';
import { loginAdmin, logoutAdmin, requireAdmin } from '@/server/admin-auth';
export async function GET() {
  return handler(async () => {
    const admin = await requireAdmin();
    return Response.json(
      { username: admin.username },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const input = z
      .object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(256) })
      .parse(await readJson(request));
    return Response.json(await loginAdmin(input.username, input.password));
  });
}
export async function DELETE(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    await logoutAdmin();
    return Response.json({ ok: true });
  });
}
