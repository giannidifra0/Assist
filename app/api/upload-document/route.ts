import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { embedTextsBatch } from '@/lib/ai/gemini';
import { buildManualChunkEmbeddingText } from '@/lib/ai/knowledge-embedding';
import {
  hasPdfMagicBytes,
  isNonEmptyString,
  MAX_PDF_SIZE_BYTES,
  sanitizeFilename,
  sanitizeOptionalText,
} from '@/lib/security/validation';
import type { ParsedChunk } from '@/lib/types/domain';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_CHUNKS = 300;

export async function POST(req: Request) {
  const auth = await requireAuth('manuals:manage');
  if (auth.errorResponse) return auth.errorResponse;

  const admin = createAdminSupabaseClient();
  let uploadedFileName: string | null = null;
  let insertedDocId: string | null = null;

  try {
    const formData = await req.formData();
    const fileEntry = formData.get('file');
    const titoloRaw = formData.get('titolo');
    const versioneRaw = formData.get('versione');
    const prodottoRaw = formData.get('prodotto');
    const chunksString = formData.get('chunks');

    if (!fileEntry || !(fileEntry instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'File PDF originale mancante.' },
        { status: 400 }
      );
    }

    if (fileEntry.size === 0 || fileEntry.size > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Il file PDF deve essere inferiore a 25 MB.' },
        { status: 400 }
      );
    }

    if (!isNonEmptyString(titoloRaw, 1, 200)) {
      return NextResponse.json(
        { success: false, error: 'Il titolo del manuale è obbligatorio.' },
        { status: 400 }
      );
    }

    if (typeof chunksString !== 'string' || !chunksString.trim()) {
      return NextResponse.json(
        { success: false, error: 'Frammenti di testo (chunks) mancanti.' },
        { status: 400 }
      );
    }

    const fileBuffer = await fileEntry.arrayBuffer();
    if (!hasPdfMagicBytes(fileBuffer)) {
      return NextResponse.json(
        { success: false, error: 'Il file caricato non è un PDF valido.' },
        { status: 400 }
      );
    }

    let parsedChunks: ParsedChunk[];
    try {
      const raw = JSON.parse(chunksString) as unknown;
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CHUNKS) {
        throw new Error('Numero di chunk non valido.');
      }
      parsedChunks = raw.map((item) => {
        const obj = item as Partial<ParsedChunk>;
        return {
          capitolo: sanitizeOptionalText(obj.capitolo, 300) || 'Sezione',
          pagina: Number.isFinite(Number(obj.pagina)) ? Math.max(1, Math.trunc(Number(obj.pagina))) : 1,
          testo: typeof obj.testo === 'string' ? obj.testo.trim() : '',
        };
      }).filter((chunk) => chunk.testo.length > 0);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Formato dei chunk non valido o vuoto.' },
        { status: 400 }
      );
    }

    if (parsedChunks.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nessun chunk testuale valido da salvare.' },
        { status: 400 }
      );
    }

    const titolo = titoloRaw.trim();
    const versione = sanitizeOptionalText(versioneRaw, 60) || '1.0';
    const prodotto = sanitizeOptionalText(prodottoRaw, 120);

    // 1. Caricamento del file fisico su Supabase Storage
    const safeName = sanitizeFilename(fileEntry.name);
    const uniqueFileName = `${Date.now()}_${safeName}`;

    const { error: storageError } = await admin.storage
      .from('manuali_pdf')
      .upload(uniqueFileName, fileBuffer, { contentType: 'application/pdf' });

    if (storageError) {
      throw new Error(`Errore Storage: impossibile salvare il file PDF (${storageError.message})`);
    }
    uploadedFileName = uniqueFileName;

    // 2. Salvataggio documento padre
    const { data: docData, error: docError } = await admin
      .from('documenti')
      .insert([
        {
          titolo,
          versione,
          prodotto,
          pdf_url: uniqueFileName,
        },
      ])
      .select('id')
      .single();

    if (docError || !docData) {
      throw new Error(`Errore DB (Documento): ${docError?.message || 'Sconosciuto'}`);
    }
    insertedDocId = String(docData.id);

    // 3. Vettorizzazione batch e salvataggio massivo dei chunk
    const textsToEmbed = parsedChunks.map((chunk) =>
      buildManualChunkEmbeddingText({
        titolo,
        prodotto,
        versione,
        capitolo: chunk.capitolo,
        pagina: chunk.pagina,
        testo: chunk.testo,
      })
    );

    const vectors = await embedTextsBatch(textsToEmbed, {
      taskType: 'RETRIEVAL_DOCUMENT',
      maxSubBatchSize: 25,
      maxCharsPerRequest: 40_000,
    });

    const missingIdx = vectors.findIndex((vec) => !vec || vec.length === 0);
    if (missingIdx !== -1) {
      throw new Error(`Generazione embedding fallita per la sezione #${missingIdx + 1}.`);
    }

    const chunkPayload = parsedChunks.map((chunk, idx) => ({
      documento_id: insertedDocId,
      capitolo: chunk.capitolo,
      pagina: chunk.pagina,
      testo: chunk.testo,
      embedding: vectors[idx] as number[],
    }));

    const INSERT_SLICE_SIZE = 50;
    for (let i = 0; i < chunkPayload.length; i += INSERT_SLICE_SIZE) {
      const slice = chunkPayload.slice(i, i + INSERT_SLICE_SIZE);
      const { error: chunkError } = await admin.from('documenti_chunk').insert(slice);
      if (chunkError) {
        throw new Error(`Errore DB (Chunk): ${chunkError.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Manuale salvato! ${chunkPayload.length} sezioni elaborate e apprese dall'IA.`,
    });
  } catch (error: unknown) {
    console.error('Errore upload-document:', error);

    // Rollback atomico su eventuali residui parziali
    if (insertedDocId) {
      await admin.from('documenti_chunk').delete().eq('documento_id', insertedDocId);
      await admin.from('documenti').delete().eq('id', insertedDocId);
    }
    if (uploadedFileName) {
      await admin.storage.from('manuali_pdf').remove([uploadedFileName]);
    }

    const message = error instanceof Error ? error.message : 'Errore durante il salvataggio manuale.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
