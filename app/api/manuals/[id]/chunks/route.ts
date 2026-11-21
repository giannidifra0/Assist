import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { embedText } from '@/lib/ai/gemini';
import { buildManualChunkEmbeddingText } from '@/lib/ai/knowledge-embedding';
import { isNonEmptyString, isValidId, sanitizeOptionalText } from '@/lib/security/validation';
import type { ManualChunk } from '@/lib/types/domain';

interface RawChunkRow {
  id: string | number;
  documento_id: string | number;
  capitolo: string | null;
  pagina: number | null;
  testo: string | null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth('manuals:read');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return NextResponse.json({ success: false, error: 'ID manuale non valido.' }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from('documenti_chunk')
      .select('id, documento_id, capitolo, pagina, testo')
      .eq('documento_id', id.trim())
      .order('pagina', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const chunks: ManualChunk[] = ((data ?? []) as RawChunkRow[]).map((row) => ({
      id: String(row.id),
      documento_id: String(row.documento_id),
      capitolo: row.capitolo ?? 'Sezione',
      pagina: row.pagina ?? 1,
      testo: row.testo ?? '',
    }));

    return NextResponse.json({ success: true, chunks });
  } catch (error: unknown) {
    console.error('Errore GET /api/manuals/[id]/chunks:', error);
    const message = error instanceof Error ? error.message : 'Errore caricamento sezioni manuale.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth('manuals:manage');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return NextResponse.json({ success: false, error: 'ID manuale non valido.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as {
      chunkId?: unknown;
      capitolo?: unknown;
      pagina?: unknown;
      testo?: unknown;
    } | null;

    if (
      !body ||
      !isValidId(body.chunkId) ||
      !isNonEmptyString(body.testo, 5, 25_000)
    ) {
      return NextResponse.json(
        { success: false, error: 'ID sezione e testo valido sono obbligatori.' },
        { status: 400 }
      );
    }

    const docId = id.trim();
    const chunkId = body.chunkId.trim();
    const capitolo = sanitizeOptionalText(body.capitolo, 300) || 'Sezione';
    const paginaRaw = Number(body.pagina);
    const pagina = Number.isFinite(paginaRaw) && paginaRaw >= 1 ? Math.trunc(paginaRaw) : 1;
    const testo = body.testo.trim();

    const admin = createAdminSupabaseClient();

    const { data: docRow, error: docError } = await admin
      .from('documenti')
      .select('titolo, prodotto, versione')
      .eq('id', docId)
      .maybeSingle<{ titolo?: string | null; prodotto?: string | null; versione?: string | null }>();

    if (docError || !docRow) {
      return NextResponse.json(
        { success: false, error: 'Manuale padre non trovato.' },
        { status: 404 }
      );
    }

    const textToEmbed = buildManualChunkEmbeddingText({
      titolo: docRow.titolo,
      prodotto: docRow.prodotto,
      versione: docRow.versione,
      capitolo,
      pagina,
      testo,
    });
    const embedding = await embedText(textToEmbed, {
      taskType: 'RETRIEVAL_DOCUMENT',
      title: `${docRow.titolo ?? 'Manuale'} - ${capitolo}`,
    });

    const { error: updateError } = await admin
      .from('documenti_chunk')
      .update({
        capitolo,
        pagina,
        testo,
        embedding,
      })
      .eq('id', chunkId)
      .eq('documento_id', docId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      success: true,
      chunk: { id: chunkId, documento_id: docId, capitolo, pagina, testo } satisfies ManualChunk,
    });
  } catch (error: unknown) {
    console.error('Errore PATCH /api/manuals/[id]/chunks:', error);
    const message = error instanceof Error ? error.message : 'Errore aggiornamento sezione.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth('manuals:manage');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return NextResponse.json({ success: false, error: 'ID manuale non valido.' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const queryChunkId = searchParams.get('chunkId');
    const body = (await req.json().catch(() => null)) as { chunkId?: unknown } | null;
    const targetChunkId = queryChunkId ?? body?.chunkId;

    if (!isValidId(targetChunkId)) {
      return NextResponse.json({ success: false, error: 'ID sezione non valido.' }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { error } = await admin
      .from('documenti_chunk')
      .delete()
      .eq('id', targetChunkId.trim())
      .eq('documento_id', id.trim());

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Errore DELETE /api/manuals/[id]/chunks:', error);
    const message = error instanceof Error ? error.message : 'Errore eliminazione sezione.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
