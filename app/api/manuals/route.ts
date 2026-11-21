import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { embedTextsBatch } from '@/lib/ai/gemini';
import { buildManualChunkEmbeddingText } from '@/lib/ai/knowledge-embedding';
import { isNonEmptyString, isValidId, sanitizeOptionalText } from '@/lib/security/validation';
import type { ManualDocument } from '@/lib/types/domain';

export const maxDuration = 60;

type RawDocumentRow = Record<string, unknown>;

const DATE_CANDIDATE_KEYS = [
  'created_at',
  'data_caricamento',
  'data_creazione',
  'inserted_at',
  'updated_at',
] as const;

function extractSafeDateIso(row: RawDocumentRow, pdfUrl: string | null): string {
  for (const key of DATE_CANDIDATE_KEYS) {
    const val = row[key];
    if (typeof val === 'string' && val.trim()) {
      const parsed = new Date(val);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  if (pdfUrl) {
    const match = pdfUrl.match(/^(\d{13})_/);
    if (match?.[1]) {
      const epochMs = Number(match[1]);
      if (Number.isFinite(epochMs)) {
        const parsed = new Date(epochMs);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }
    }
  }

  return '';
}

function toStringField(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export async function GET() {
  const auth = await requireAuth('manuals:read');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from('documenti').select('*');

    if (error) {
      throw new Error(error.message);
    }

    const manuals: ManualDocument[] = ((data ?? []) as RawDocumentRow[]).map((row) => {
      const pdfUrlRaw = typeof row.pdf_url === 'string' ? row.pdf_url : null;
      return {
        id: String(row.id ?? ''),
        titolo: toStringField(row.titolo),
        prodotto: toStringField(row.prodotto),
        versione: toStringField(row.versione),
        pdf_url: pdfUrlRaw,
        created_at: extractSafeDateIso(row, pdfUrlRaw),
      };
    });

    manuals.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return a.titolo.localeCompare(b.titolo, 'it');
    });

    return NextResponse.json({
      success: true,
      manuals,
    });
  } catch (error: unknown) {
    console.error('Errore GET /api/manuals:', error);
    const message = error instanceof Error ? error.message : 'Errore caricamento manuali.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAuth('manuals:manage');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json().catch(() => null)) as {
      id?: unknown;
      titolo?: unknown;
      prodotto?: unknown;
      versione?: unknown;
    } | null;

    if (!body || !isValidId(body.id) || !isNonEmptyString(body.titolo, 1, 200)) {
      return NextResponse.json(
        { success: false, error: 'ID manuale e titolo sono obbligatori.' },
        { status: 400 }
      );
    }

    const docId = body.id.trim();
    const nextTitolo = body.titolo.trim();
    const nextProdotto = sanitizeOptionalText(body.prodotto, 120);
    const nextVersione = sanitizeOptionalText(body.versione, 60) || '1.0';

    const admin = createAdminSupabaseClient();

    const { data: existingDoc, error: existingErr } = await admin
      .from('documenti')
      .select('titolo, prodotto, versione')
      .eq('id', docId)
      .maybeSingle<{ titolo?: string | null; prodotto?: string | null; versione?: string | null }>();

    if (existingErr || !existingDoc) {
      return NextResponse.json(
        { success: false, error: 'Manuale non trovato.' },
        { status: 404 }
      );
    }

    const metadataChanged =
      (existingDoc.titolo ?? '') !== nextTitolo ||
      (existingDoc.prodotto ?? '') !== nextProdotto ||
      (existingDoc.versione ?? '') !== nextVersione;

    const { error } = await admin
      .from('documenti')
      .update({
        titolo: nextTitolo,
        prodotto: nextProdotto,
        versione: nextVersione,
      })
      .eq('id', docId);

    if (error) {
      throw new Error(error.message);
    }

    let reembeddedChunks = 0;
    let pendingReembedChunks = 0;

    if (metadataChanged) {
      const { data: chunksRaw } = await admin
        .from('documenti_chunk')
        .select('id, capitolo, pagina, testo')
        .eq('documento_id', docId)
        .order('id', { ascending: true });

      const chunks = (chunksRaw ?? []) as Array<{
        id: string | number;
        capitolo: string | null;
        pagina: number | null;
        testo: string | null;
      }>;

      if (chunks.length > 120) {
        await admin.from('documenti_chunk').update({ embedding: null }).eq('documento_id', docId);
        pendingReembedChunks = chunks.length;
      } else if (chunks.length > 0) {
        const prepared = chunks
          .map((c) => ({
            id: String(c.id),
            text: buildManualChunkEmbeddingText({
              titolo: nextTitolo,
              prodotto: nextProdotto,
              versione: nextVersione,
              capitolo: c.capitolo,
              pagina: c.pagina,
              testo: c.testo,
            }),
          }))
          .filter((item) => Boolean(item.text));

        if (prepared.length > 0) {
          const vectors = await embedTextsBatch(
            prepared.map((item) => item.text),
            {
              taskType: 'RETRIEVAL_DOCUMENT',
              maxSubBatchSize: 25,
              deadlineMs: Date.now() + 35_000,
            }
          );

          for (let i = 0; i < prepared.length; i += 10) {
            const slice = prepared.slice(i, i + 10);
            await Promise.all(
              slice.map(async (item, offsetIdx) => {
                const vec = vectors[i + offsetIdx];
                if (vec) {
                  const { error: updErr } = await admin
                    .from('documenti_chunk')
                    .update({ embedding: vec })
                    .eq('id', item.id);
                  if (!updErr) {
                    reembeddedChunks++;
                  } else {
                    pendingReembedChunks++;
                  }
                } else {
                  await admin
                    .from('documenti_chunk')
                    .update({ embedding: null })
                    .eq('id', item.id);
                  pendingReembedChunks++;
                }
              })
            );
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      reembeddedChunks,
      pendingReembedChunks,
    });
  } catch (error: unknown) {
    console.error('Errore PATCH /api/manuals:', error);
    const message = error instanceof Error ? error.message : 'Errore aggiornamento manuale.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
