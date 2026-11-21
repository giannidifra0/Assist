import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { embedAndSaveKnowledge } from '@/lib/ai/knowledge-embedding';
import { isNonEmptyString, isValidId, sanitizeOptionalText } from '@/lib/security/validation';
import type { KnowledgeEmbeddingFilter, KnowledgeItem } from '@/lib/types/domain';

const SORTABLE_COLUMNS = new Set([
  'numero_originale',
  'riferimento',
  'classe',
  'oggetto',
  'tipologia',
  'argomento',
  'contenuto',
  'prodotto_1',
  'prodotto_2',
  'prodotto_3',
  'prodotto_4',
  'prodotto_5',
  'prodotto_6',
  'data_pubblicazione',
]);

const FILTERABLE_COLUMNS = new Set(SORTABLE_COLUMNS);

function buildSanitizedRecord(body: Record<string, unknown>) {
  const rawDate = sanitizeOptionalText(body.data_pubblicazione, 20);
  return {
    numero_originale: sanitizeOptionalText(body.numero_originale, 120),
    riferimento: sanitizeOptionalText(body.riferimento, 120),
    data_pubblicazione: rawDate || null,
    classe: sanitizeOptionalText(body.classe, 120),
    tipologia: sanitizeOptionalText(body.tipologia, 120),
    argomento: sanitizeOptionalText(body.argomento, 200),
    prodotto_1: sanitizeOptionalText(body.prodotto_1, 120),
    prodotto_2: sanitizeOptionalText(body.prodotto_2, 120),
    prodotto_3: sanitizeOptionalText(body.prodotto_3, 120),
    prodotto_4: sanitizeOptionalText(body.prodotto_4, 120),
    prodotto_5: sanitizeOptionalText(body.prodotto_5, 120),
    prodotto_6: sanitizeOptionalText(body.prodotto_6, 120),
    oggetto: String(body.oggetto ?? '').trim().slice(0, 500),
    contenuto: String(body.contenuto ?? '').trim().slice(0, 50_000),
    embedding: null,
  };
}

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseEmbeddingStatus(raw: string | null): KnowledgeEmbeddingFilter {
  if (raw === 'synced' || raw === 'pending') return raw;
  return 'all';
}

function parseFiltersParam(raw: string | null): Array<[string, string]> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    return Object.entries(parsed as Record<string, unknown>)
      .filter(
        ([key, value]) =>
          FILTERABLE_COLUMNS.has(key) && typeof value === 'string' && value.trim().length > 0
      )
      .map(([key, value]) => [key, (value as string).trim().slice(0, 120)]);
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const auth = await requireAuth('kb:read');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const page = parsePositiveInt(searchParams.get('page'), 1, 1, 10_000);
    const pageSize = parsePositiveInt(searchParams.get('pageSize'), 15, 5, 100);
    const rawSearch = searchParams.get('search')?.trim() ?? '';
    const sanitizedSearch = rawSearch.replace(/[,()*\\]/g, ' ').trim().slice(0, 120);
    const sortByRaw = searchParams.get('sortBy')?.trim() ?? '';
    const sortBy = SORTABLE_COLUMNS.has(sortByRaw) ? sortByRaw : '';
    const sortDir = searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc';
    const embeddingStatus = parseEmbeddingStatus(searchParams.get('embeddingStatus'));
    const columnFilters = parseFiltersParam(searchParams.get('filters'));

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const admin = createAdminSupabaseClient();

    // 1. Tentativo primario sulla vista leggera (contiene boolean ha_embedding)
    let viewQuery = admin.from('knowledge_base_leggera').select('*', { count: 'exact' });

    if (sanitizedSearch) {
      const pattern = `%${sanitizedSearch}%`;
      viewQuery = viewQuery.or(
        `oggetto.ilike.${pattern},riferimento.ilike.${pattern},numero_originale.ilike.${pattern},argomento.ilike.${pattern},contenuto.ilike.${pattern}`
      );
    }

    for (const [col, val] of columnFilters) {
      viewQuery = viewQuery.ilike(col, `%${val}%`);
    }

    if (embeddingStatus === 'synced') {
      viewQuery = viewQuery.eq('ha_embedding', true);
    } else if (embeddingStatus === 'pending') {
      viewQuery = viewQuery.eq('ha_embedding', false);
    }

    if (sortBy) {
      viewQuery = viewQuery.order(sortBy, { ascending: sortDir === 'asc' });
    } else {
      viewQuery = viewQuery.order('id', { ascending: false });
    }

    const viewResult = await viewQuery.range(from, to);

    if (!viewResult.error && viewResult.data) {
      const total = viewResult.count ?? viewResult.data.length;
      return NextResponse.json({
        success: true,
        items: viewResult.data as KnowledgeItem[],
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      });
    }

    // 2. Fallback sulla tabella reale se la vista non fosse disponibile
    let tableQuery = admin
      .from('knowledge_base')
      .select(
        'id, numero_originale, riferimento, classe, oggetto, tipologia, argomento, contenuto, data_pubblicazione, prodotto_1, prodotto_2, prodotto_3, prodotto_4, prodotto_5, prodotto_6',
        { count: 'exact' }
      );

    if (sanitizedSearch) {
      const pattern = `%${sanitizedSearch}%`;
      tableQuery = tableQuery.or(
        `oggetto.ilike.${pattern},riferimento.ilike.${pattern},numero_originale.ilike.${pattern},argomento.ilike.${pattern},contenuto.ilike.${pattern}`
      );
    }

    for (const [col, val] of columnFilters) {
      tableQuery = tableQuery.ilike(col, `%${val}%`);
    }

    if (embeddingStatus === 'synced') {
      tableQuery = tableQuery.not('embedding', 'is', null);
    } else if (embeddingStatus === 'pending') {
      tableQuery = tableQuery.is('embedding', null);
    }

    if (sortBy) {
      tableQuery = tableQuery.order(sortBy, { ascending: sortDir === 'asc' });
    } else {
      tableQuery = tableQuery.order('id', { ascending: false });
    }

    const fallback = await tableQuery.range(from, to);
    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    const total = fallback.count ?? (fallback.data?.length ?? 0);
    const mapped = (fallback.data ?? []).map((row) => ({
      ...row,
      ha_embedding: embeddingStatus === 'synced',
    })) as KnowledgeItem[];

    return NextResponse.json({
      success: true,
      items: mapped,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error: unknown) {
    console.error('Errore GET /api/knowledge:', error);
    const message = error instanceof Error ? error.message : 'Errore caricamento Knowledge Base.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth('kb:write');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (
      !body ||
      !isNonEmptyString(body.oggetto, 2, 500) ||
      !isNonEmptyString(body.contenuto, 2, 50_000)
    ) {
      return NextResponse.json(
        { success: false, error: 'Oggetto e contenuto tecnico sono obbligatori.' },
        { status: 400 }
      );
    }

    const record = buildSanitizedRecord(body);
    const admin = createAdminSupabaseClient();

    const { data, error } = await admin
      .from('knowledge_base')
      .insert([record])
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Impossibile salvare la scheda.');
    }

    const savedId = String(data.id);
    const embedded = await embedAndSaveKnowledge(savedId, record);

    return NextResponse.json({ success: true, id: savedId, embedded });
  } catch (error: unknown) {
    console.error('Errore POST /api/knowledge:', error);
    const message = error instanceof Error ? error.message : 'Errore creazione scheda.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAuth('kb:write');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (
      !body ||
      !isValidId(body.id) ||
      !isNonEmptyString(body.oggetto, 2, 500) ||
      !isNonEmptyString(body.contenuto, 2, 50_000)
    ) {
      return NextResponse.json(
        { success: false, error: 'ID scheda, oggetto e contenuto tecnico sono obbligatori.' },
        { status: 400 }
      );
    }

    const targetId = body.id.trim();
    const record = buildSanitizedRecord(body);
    const admin = createAdminSupabaseClient();

    const { error } = await admin.from('knowledge_base').update(record).eq('id', targetId);

    if (error) {
      throw new Error(error.message);
    }

    const embedded = await embedAndSaveKnowledge(targetId, record);

    return NextResponse.json({ success: true, id: targetId, embedded });
  } catch (error: unknown) {
    console.error('Errore PATCH /api/knowledge:', error);
    const message = error instanceof Error ? error.message : 'Errore aggiornamento scheda.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAuth('kb:delete');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const queryId = searchParams.get('id');
    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const targetId = queryId ?? body?.id;

    if (!isValidId(targetId)) {
      return NextResponse.json({ success: false, error: 'ID scheda non valido.' }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { error } = await admin.from('knowledge_base').delete().eq('id', targetId.trim());

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Errore DELETE /api/knowledge:', error);
    const message = error instanceof Error ? error.message : 'Errore eliminazione scheda.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
