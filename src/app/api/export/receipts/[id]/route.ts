import { assertAdmin, ForbiddenError } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { expenseReceipt } from '@/server/services/expenses';

export const dynamic = 'force-dynamic';

/**
 * Beleg einer Ausgabe (nur Admins).
 * GET /api/export/receipts/<ausgabe-id>             → im Browser anzeigen
 * GET /api/export/receipts/<ausgabe-id>?download=1  → herunterladen
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdmin();
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
    throw e;
  }
  const id = Number((await params).id);
  const receipt = Number.isSafeInteger(id) && id > 0 ? expenseReceipt(getDb(), id) : null;
  if (!receipt) return new Response('Not found', { status: 404 });

  const download = new URL(request.url).searchParams.get('download') === '1';
  const asciiName = receipt.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return new Response(new Uint8Array(receipt.content), {
    headers: {
      'Content-Type': receipt.type,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(receipt.fileName)}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
