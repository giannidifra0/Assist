import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isSafeStorageFilename, isValidId } from '@/lib/security/validation';

export async function POST(req: Request) {
  const auth = await requireAuth('manuals:manage');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    if (!body || !isValidId(body.id)) {
      return NextResponse.json(
        { success: false, error: 'ID Documento mancante o non valido.' },
        { status: 400 }
      );
    }

    const docId = body.id.trim();
    const admin = createAdminSupabaseClient();

    // 1. Recuperiamo pdf_url dalla tabella padre 'documenti' (con fallback su 'documenti_chunk')
    const { data: docRow } = await admin
      .from('documenti')
      .select('pdf_url')
      .eq('id', docId)
      .maybeSingle<{ pdf_url?: string | null }>();

    let pdfUrl = docRow?.pdf_url ?? null;

    if (!pdfUrl) {
      const { data: chunks } = await admin
        .from('documenti_chunk')
        .select('pdf_url')
        .eq('documento_id', docId)
        .limit(1);
      pdfUrl = (chunks?.[0] as { pdf_url?: string | null } | undefined)?.pdf_url ?? null;
    }

    // 2. Eliminiamo i chunk testuali dal database
    const { error: chunkDeleteError } = await admin
      .from('documenti_chunk')
      .delete()
      .eq('documento_id', docId);

    if (chunkDeleteError) {
      throw new Error(`Errore eliminazione chunk: ${chunkDeleteError.message}`);
    }

    // 3. Eliminiamo l'anagrafica del documento padre
    const { error: dbError } = await admin.from('documenti').delete().eq('id', docId);
    if (dbError) {
      throw new Error(`Errore eliminazione DB: ${dbError.message}`);
    }

    // 4. Eliminiamo il file fisico dal Bucket (se presente e sicuro)
    if (pdfUrl && pdfUrl !== 'NESSUNO' && isSafeStorageFilename(pdfUrl)) {
      const { error: storageError } = await admin.storage.from('manuali_pdf').remove([pdfUrl]);
      if (storageError) {
        console.warn('Pulizia Storage non riuscita (ignorata):', storageError.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Documento e PDF eliminati con successo.',
    });
  } catch (error: unknown) {
    console.error('Errore API delete-document:', error);
    const message = error instanceof Error ? error.message : 'Errore eliminazione documento.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
