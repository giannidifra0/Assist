import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isSafeStorageFilename } from '@/lib/security/validation';

export async function GET(req: Request) {
  const auth = await requireAuth('manuals:read');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const fileName = searchParams.get('file')?.trim() ?? '';
    const inlineMode = searchParams.get('inline') === '1';

    if (!fileName || !isSafeStorageFilename(fileName)) {
      return new NextResponse('Nome file mancante o non valido.', { status: 400 });
    }

    const admin = createAdminSupabaseClient();

    // Verifica allowlist sul DB prima di accedere allo Storage
    const { data: docMatch } = await admin
      .from('documenti')
      .select('id')
      .eq('pdf_url', fileName)
      .limit(1)
      .maybeSingle();

    if (!docMatch) {
      const { data: chunkMatch } = await admin
        .from('documenti_chunk')
        .select('id')
        .eq('pdf_url', fileName)
        .limit(1)
        .maybeSingle();

      if (!chunkMatch) {
        return new NextResponse('File non associato ad alcun manuale censito.', { status: 404 });
      }
    }

    const { data, error } = await admin.storage.from('manuali_pdf').download(fileName);
    if (error || !data) {
      return new NextResponse('File non trovato nel bucket.', { status: 404 });
    }

    const disposition = inlineMode ? 'inline' : 'attachment';

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${fileName}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: unknown) {
    console.error('Errore Download:', error);
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    return new NextResponse(`Errore durante il download del file: ${message}`, { status: 500 });
  }
}
