import { handler } from '@/server/http';
import { requireAccount } from '@/server/accounts';
import { personalImpact } from '@/server/services/personal-impact';
import { impactPdf } from '@/server/impact-pdf';

export const runtime = 'nodejs';
export async function GET() {
  return handler(async () => {
    const account = await requireAccount();
    const bytes = await impactPdf(await personalImpact(account.id, account.username));
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="personal-impact.pdf"',
        'Cache-Control': 'private, no-store',
      },
    });
  });
}
