import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { embedTextsBatch } from '@/lib/ai/gemini';
import {
  buildKnowledgeEmbeddingText,
  buildManualChunkEmbeddingText,
} from '@/lib/ai/knowledge-embedding';
import type {
  EmbeddingSyncBatchResponse,
  EmbeddingSyncCounts,
  EmbeddingSyncMode,
  EmbeddingSyncTarget,
} from '@/lib/types/domain';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const DEFAULT_BATCH_SIZE = 50;
const SUB_BATCH_SIZE = 25;
const DB_WRITE_CONCURRENCY = 10;
const SOFT_DEADLINE_MS = 38_000;

interface KnowledgeBatchRow {
  id: string | number;
  numero_originale: string | null;
  riferimento: string | null;
  data_pubblicazione: string | null;
  classe: string | null;
  tipologia: string | null;
  argomento: string | null;
  prodotto_1: string | null;
  prodotto_2: string | null;
  prodotto_3: string | null;
  prodotto_4: string | null;
  prodotto_5: string | null;
  prodotto_6: string | null;
  oggetto: string | null;
  contenuto: string | null;
}

interface ManualChunkBatchRow {
  id: string | number;
  documento_id: string | number;
  capitolo: string | null;
  pagina: number | null;
  testo: string | null;
}

interface ManualParentMeta {
  id: string | number;
  titolo: string | null;
  prodotto: string | null;
  versione: string | null;
}

interface PreparedRow {
  id: string;
  text: string;
  rowIndex: number;
}

async function runParallelUpdates(
  table: 'knowledge_base' | 'documenti_chunk',
  tasks: Array<{ id: string; embedding: number[] }>
): Promise<{ updated: number; failed: number }> {
  if (tasks.length === 0) return { updated: 0, failed: 0 };

  const admin = createAdminSupabaseClient();
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < tasks.length; i += DB_WRITE_CONCURRENCY) {
    const slice = tasks.slice(i, i + DB_WRITE_CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (item) => {
        const { error } = await admin
          .from(table)
          .update({ embedding: item.embedding })
          .eq('id', item.id);
        if (error) {
          console.error(`Aggiornamento embedding ${table}/${item.id} fallito:`, error.message);
          return false;
        }
        return true;
      })
    );
    for (const ok of results) {
      if (ok) updated++;
      else failed++;
    }
  }

  return { updated, failed };
}

async function processPreparedBatch(
  table: 'knowledge_base' | 'documenti_chunk',
  totalRows: number,
  getRowId: (rowIndex: number) => string,
  validItems: PreparedRow[],
  deadlineMs: number
): Promise<{
  processed: number;
  skipped: number;
  failed: number;
  lastId: string | null;
}> {
  if (validItems.length === 0) {
    return {
      processed: 0,
      skipped: totalRows,
      failed: 0,
      lastId: totalRows > 0 ? getRowId(totalRows - 1) : null,
    };
  }

  const updateTasks: Array<{ id: string; embedding: number[] }> = [];
  let failed = 0;
  let skipped = 0;
  let cursorRowIdx = -1;

  for (let offset = 0; offset < validItems.length; offset += SUB_BATCH_SIZE) {
    if (offset > 0 && Date.now() >= deadlineMs) {
      break;
    }

    const slice = validItems.slice(offset, offset + SUB_BATCH_SIZE);
    const vectors = await embedTextsBatch(
      slice.map((item) => item.text),
      {
        taskType: 'RETRIEVAL_DOCUMENT',
        maxSubBatchSize: SUB_BATCH_SIZE,
        maxCharsPerRequest: 40_000,
        deadlineMs,
      }
    );

    const hitDeadline = Date.now() >= deadlineMs;

    if (!hitDeadline) {
      for (let i = 0; i < slice.length; i++) {
        const vec = vectors[i];
        const prevCursor = cursorRowIdx;
        cursorRowIdx = slice[i].rowIndex;
        if (cursorRowIdx > prevCursor + 1) {
          skipped += cursorRowIdx - prevCursor - 1;
        }

        if (vec) {
          updateTasks.push({ id: slice[i].id, embedding: vec });
        } else {
          failed++;
        }
      }
    } else {
      // Se il soft-deadline è scattato dentro il sotto-batch, salviamo solo i vettori già ottenuti
      // fermando il cursore prima di eventuali elementi non completati così restano elegibili al giro dopo
      let contiguousDone = true;
      for (let i = 0; i < slice.length; i++) {
        const vec = vectors[i];
        if (vec) {
          updateTasks.push({ id: slice[i].id, embedding: vec });
          if (contiguousDone) {
            const prevCursor = cursorRowIdx;
            cursorRowIdx = slice[i].rowIndex;
            if (cursorRowIdx > prevCursor + 1) {
              skipped += cursorRowIdx - prevCursor - 1;
            }
          }
        } else {
          contiguousDone = false;
        }
      }
      break;
    }
  }

  // Se tutte le righe valide del batch sono state elaborate prima della scadenza,
  // includiamo nel cursore anche eventuali righe vuote (skipped) in coda.
  if (Date.now() < deadlineMs && cursorRowIdx === validItems[validItems.length - 1].rowIndex) {
    const trailingSkipped = totalRows - 1 - cursorRowIdx;
    if (trailingSkipped > 0) {
      skipped += trailingSkipped;
      cursorRowIdx = totalRows - 1;
    }
  }

  const writeRes = await runParallelUpdates(table, updateTasks);
  failed += writeRes.failed;

  return {
    processed: writeRes.updated,
    skipped,
    failed,
    lastId: cursorRowIdx >= 0 ? getRowId(cursorRowIdx) : null,
  };
}

export async function GET() {
  const auth = await requireAuth('ai:sync_embeddings');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const admin = createAdminSupabaseClient();
    const [kbTotalRes, kbPendingRes, mcTotalRes, mcPendingRes] = await Promise.all([
      admin.from('knowledge_base').select('*', { count: 'exact', head: true }),
      admin.from('knowledge_base').select('*', { count: 'exact', head: true }).is('embedding', null),
      admin.from('documenti_chunk').select('*', { count: 'exact', head: true }),
      admin.from('documenti_chunk').select('*', { count: 'exact', head: true }).is('embedding', null),
    ]);

    if (kbTotalRes.error || kbPendingRes.error) {
      throw new Error(kbTotalRes.error?.message || kbPendingRes.error?.message || 'Errore DB');
    }

    const counts: EmbeddingSyncCounts = {
      knowledgeTotal: kbTotalRes.count ?? 0,
      knowledgePending: kbPendingRes.count ?? 0,
      manualChunksTotal: mcTotalRes.error ? 0 : (mcTotalRes.count ?? 0),
      manualChunksPending: mcPendingRes.error ? 0 : (mcPendingRes.count ?? 0),
    };

    return NextResponse.json({ success: true, counts });
  } catch (error: unknown) {
    console.error('ERRORE GET EMBEDDINGS COUNTS:', error);
    const message = error instanceof Error ? error.message : 'Errore conteggio vettori.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth('ai:sync_embeddings');
  if (auth.errorResponse) return auth.errorResponse;

  const startedAt = Date.now();
  const deadlineMs = startedAt + SOFT_DEADLINE_MS;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      target?: unknown;
      mode?: unknown;
      afterId?: unknown;
      batchSize?: unknown;
    };

    const target: EmbeddingSyncTarget = body.target === 'manuals' ? 'manuals' : 'knowledge';
    const mode: EmbeddingSyncMode = body.mode === 'all' ? 'all' : 'pending';
    const afterId =
      typeof body.afterId === 'string' && body.afterId.trim() ? body.afterId.trim() : null;
    const rawBatchSize = Number(body.batchSize);
    const batchSize = Number.isFinite(rawBatchSize)
      ? Math.min(60, Math.max(10, Math.trunc(rawBatchSize)))
      : DEFAULT_BATCH_SIZE;

    const admin = createAdminSupabaseClient();

    if (target === 'knowledge') {
      let query = admin
        .from('knowledge_base')
        .select(
          'id, numero_originale, riferimento, data_pubblicazione, classe, tipologia, argomento, prodotto_1, prodotto_2, prodotto_3, prodotto_4, prodotto_5, prodotto_6, oggetto, contenuto'
        )
        .order('id', { ascending: true })
        .limit(batchSize);

      if (mode === 'pending') {
        query = query.is('embedding', null);
      }
      if (afterId) {
        query = query.gt('id', afterId);
      }

      const { data: schede, error: fetchError } = await query;
      if (fetchError) {
        throw new Error(`Errore lettura DB Knowledge Base: ${fetchError.message}`);
      }

      const rows = (schede ?? []) as KnowledgeBatchRow[];
      if (rows.length === 0) {
        const res: EmbeddingSyncBatchResponse = {
          success: true,
          target,
          mode,
          processed: 0,
          skipped: 0,
          failed: 0,
          remaining: 0,
          totalPendingInDb: mode === 'pending' ? 0 : undefined,
          hasMore: false,
          lastId: afterId,
          durationMs: Date.now() - startedAt,
          message: 'Tutte le schede Knowledge Base hanno già i vettori IA aggiornati.',
        };
        return NextResponse.json(res);
      }

      const validItems: PreparedRow[] = [];
      for (let i = 0; i < rows.length; i++) {
        const text = buildKnowledgeEmbeddingText(rows[i]);
        if (text) {
          validItems.push({ id: String(rows[i].id), text, rowIndex: i });
        }
      }

      const batchOutcome = await processPreparedBatch(
        'knowledge_base',
        rows.length,
        (idx) => String(rows[idx].id),
        validItems,
        deadlineMs
      );

      let remainingQuery = admin
        .from('knowledge_base')
        .select('*', { count: 'exact', head: true });
      if (mode === 'pending') {
        remainingQuery = remainingQuery.is('embedding', null);
      }
      if (batchOutcome.lastId) {
        remainingQuery = remainingQuery.gt('id', batchOutcome.lastId);
      }

      const [remRes, totalPendingRes] = await Promise.all([
        remainingQuery,
        mode === 'pending'
          ? admin.from('knowledge_base').select('*', { count: 'exact', head: true }).is('embedding', null)
          : Promise.resolve({ count: null, error: null }),
      ]);

      const remaining = remRes.error ? 0 : (remRes.count ?? 0);
      const totalPendingInDb =
        mode === 'pending' && !totalPendingRes.error
          ? (totalPendingRes.count ?? remaining)
          : undefined;
      const hasMore =
        remaining > 0 && batchOutcome.lastId !== null && batchOutcome.lastId !== afterId;

      const message = hasMore
        ? `KB: vettorizzate ${batchOutcome.processed} schede (${remaining} rimanenti nella coda).`
        : `KB: blocco completato (${batchOutcome.processed} schede sincronizzate).`;

      const res: EmbeddingSyncBatchResponse = {
        success: true,
        target,
        mode,
        processed: batchOutcome.processed,
        skipped: batchOutcome.skipped,
        failed: batchOutcome.failed,
        remaining,
        totalPendingInDb,
        hasMore,
        lastId: batchOutcome.lastId,
        durationMs: Date.now() - startedAt,
        message,
      };
      return NextResponse.json(res);
    }

    // Target: 'manuals' (documenti_chunk)
    let chunkQuery = admin
      .from('documenti_chunk')
      .select('id, documento_id, capitolo, pagina, testo')
      .order('id', { ascending: true })
      .limit(batchSize);

    if (mode === 'pending') {
      chunkQuery = chunkQuery.is('embedding', null);
    }
    if (afterId) {
      chunkQuery = chunkQuery.gt('id', afterId);
    }

    const { data: chunkRowsRaw, error: chunkFetchError } = await chunkQuery;
    if (chunkFetchError) {
      throw new Error(`Errore lettura DB sezioni manuali: ${chunkFetchError.message}`);
    }

    const chunkRows = (chunkRowsRaw ?? []) as ManualChunkBatchRow[];
    if (chunkRows.length === 0) {
      const res: EmbeddingSyncBatchResponse = {
        success: true,
        target,
        mode,
        processed: 0,
        skipped: 0,
        failed: 0,
        remaining: 0,
        totalPendingInDb: mode === 'pending' ? 0 : undefined,
        hasMore: false,
        lastId: afterId,
        durationMs: Date.now() - startedAt,
        message: 'Tutte le sezioni dei manuali PDF hanno già i vettori IA aggiornati.',
      };
      return NextResponse.json(res);
    }

    const parentDocIds = Array.from(
      new Set(chunkRows.map((c) => String(c.documento_id)).filter(Boolean))
    );
    const parentDocsMap = new Map<string, ManualParentMeta>();
    if (parentDocIds.length > 0) {
      const { data: parentDocs } = await admin
        .from('documenti')
        .select('id, titolo, prodotto, versione')
        .in('id', parentDocIds);

      for (const doc of (parentDocs ?? []) as ManualParentMeta[]) {
        parentDocsMap.set(String(doc.id), doc);
      }
    }

    const validManualItems: PreparedRow[] = [];
    for (let i = 0; i < chunkRows.length; i++) {
      const c = chunkRows[i];
      const parent = parentDocsMap.get(String(c.documento_id));
      const text = buildManualChunkEmbeddingText({
        titolo: parent?.titolo,
        prodotto: parent?.prodotto,
        versione: parent?.versione,
        capitolo: c.capitolo,
        pagina: c.pagina,
        testo: c.testo,
      });
      if (text) {
        validManualItems.push({ id: String(c.id), text, rowIndex: i });
      }
    }

    const batchOutcome = await processPreparedBatch(
      'documenti_chunk',
      chunkRows.length,
      (idx) => String(chunkRows[idx].id),
      validManualItems,
      deadlineMs
    );

    let remainingChunkQuery = admin
      .from('documenti_chunk')
      .select('*', { count: 'exact', head: true });
    if (mode === 'pending') {
      remainingChunkQuery = remainingChunkQuery.is('embedding', null);
    }
    if (batchOutcome.lastId) {
      remainingChunkQuery = remainingChunkQuery.gt('id', batchOutcome.lastId);
    }

    const [remChunkRes, totalPendingChunkRes] = await Promise.all([
      remainingChunkQuery,
      mode === 'pending'
        ? admin.from('documenti_chunk').select('*', { count: 'exact', head: true }).is('embedding', null)
        : Promise.resolve({ count: null, error: null }),
    ]);

    const remaining = remChunkRes.error ? 0 : (remChunkRes.count ?? 0);
    const totalPendingInDb =
      mode === 'pending' && !totalPendingChunkRes.error
        ? (totalPendingChunkRes.count ?? remaining)
        : undefined;
    const hasMore =
      remaining > 0 && batchOutcome.lastId !== null && batchOutcome.lastId !== afterId;

    const message = hasMore
      ? `Manuali PDF: vettorizzate ${batchOutcome.processed} sezioni (${remaining} rimanenti).`
      : `Manuali PDF: blocco completato (${batchOutcome.processed} sezioni sincronizzate).`;

    const res: EmbeddingSyncBatchResponse = {
      success: true,
      target,
      mode,
      processed: batchOutcome.processed,
      skipped: batchOutcome.skipped,
      failed: batchOutcome.failed,
      remaining,
      totalPendingInDb,
      hasMore,
      lastId: batchOutcome.lastId,
      durationMs: Date.now() - startedAt,
      message,
    };
    return NextResponse.json(res);
  } catch (error: unknown) {
    console.error('ERRORE EMBEDDING BATCH:', error);
    const message = error instanceof Error ? error.message : 'Errore generazione embedding.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
