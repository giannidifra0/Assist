import 'server-only';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { embedText } from '@/lib/ai/gemini';

const MAX_SIMILARITY_DROP = 0.14;
const HIGH_CONFIDENCE_SIMILARITY = 0.72;
const LEXICAL_LIMIT = 10;
const FINAL_TOP_PER_SOURCE = 5;

export interface KbMatchRow {
  id?: string | number;
  numero_originale?: string | null;
  riferimento?: string | null;
  oggetto?: string | null;
  tipologia?: string | null;
  argomento?: string | null;
  contenuto?: string | null;
  similarity?: number | null;
}

export interface DocMatchRow {
  id?: string | number;
  titolo?: string | null;
  prodotto?: string | null;
  capitolo?: string | null;
  pagina?: number | null;
  pdf_url?: string | null;
  testo?: string | null;
  similarity?: number | null;
}

interface KbLexicalRow {
  id: string | number;
  numero_originale: string | null;
  riferimento: string | null;
  classe: string | null;
  oggetto: string | null;
  tipologia: string | null;
  argomento: string | null;
  contenuto: string | null;
  prodotto_1: string | null;
  prodotto_2: string | null;
  prodotto_3: string | null;
  prodotto_4: string | null;
  prodotto_5: string | null;
  prodotto_6: string | null;
}

interface KbProductLookupRow {
  id: string | number;
  prodotto_1: string | null;
  prodotto_2: string | null;
  prodotto_3: string | null;
  prodotto_4: string | null;
  prodotto_5: string | null;
  prodotto_6: string | null;
}

interface DocChunkLexicalRow {
  id: string | number;
  documento_id: string | number;
  capitolo: string | null;
  pagina: number | null;
  testo: string | null;
}

interface ParentDocRow {
  id: string | number;
  titolo: string | null;
  prodotto: string | null;
  pdf_url: string | null;
}

interface LexicalSignals {
  codeTerms: string[];
  keywords: string[];
  searchTerms: string[];
}

interface LexicalEvaluation {
  hasCodeMatch: boolean;
  titleMatches: number;
  bodyMatches: number;
  coverage: number;
}

const ITALIAN_STOPWORDS = new Set([
  'come',
  'cosa',
  'dove',
  'quando',
  'quale',
  'quali',
  'quanto',
  'quanti',
  'sono',
  'siamo',
  'siete',
  'essere',
  'stato',
  'stata',
  'stati',
  'avere',
  'abbiamo',
  'hanno',
  'questo',
  'questa',
  'questi',
  'queste',
  'quello',
  'quella',
  'quelli',
  'quelle',
  'nella',
  'nelle',
  'nello',
  'negli',
  'dalla',
  'dalle',
  'dallo',
  'dagli',
  'della',
  'delle',
  'dello',
  'degli',
  'sulla',
  'sulle',
  'sullo',
  'sugli',
  'alla',
  'alle',
  'allo',
  'agli',
  'perche',
  'perché',
  'posso',
  'puoi',
  'possiamo',
  'devo',
  'devi',
  'dobbiamo',
  'voglio',
  'vorrei',
  'serve',
  'servono',
  'bisogna',
  'problema',
  'problemi',
  'errore',
  'errori',
  'aiuto',
  'sistema',
  'procedura',
  'procedure',
  'manuale',
  'manuali',
  'scheda',
  'schede',
  'zucchetti',
  'grazie',
  'ciao',
  'buongiorno',
  'buonasera',
  'salve',
  'informazioni',
  'sapere',
  'capire',
  'funziona',
  'fare',
  'fatto',
  'senza',
  'dopo',
  'prima',
  'anche',
  'solo',
  'tutto',
  'tutti',
  'tutte',
  'molto',
  'poco',
  'altro',
  'altra',
  'altri',
  'altre',
  'caso',
  'casi',
]);

const FOLLOW_UP_PATTERN =
  /^(?:e\s+(?:se|per|come|quando|dove|invece|quindi)|anche|invece|quindi|allora|ma\s+se|non\s+funziona|da\s+errore|d[aà]\s+errore|come\s+mai|continua|spiega\s+meglio|in\s+che\s+senso|perch[eé]\??$)|\b(?:quest[oaie]|quell[oaie]|stess[oaie]|sopra|precedente|dettaglio|esempio|entrambe|entrambi)\b/i;

function truncateSnippet(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}…`;
}

export function isLikelyFollowUp(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return false;
  if (trimmed.length < 85 && FOLLOW_UP_PATTERN.test(trimmed)) {
    return true;
  }
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return wordCount <= 5 && FOLLOW_UP_PATTERN.test(trimmed);
}

export function buildRetrievalQuery(params: {
  latestPrompt: string;
  previousUserPrompt: string;
  productFilter: string | null;
}): string {
  const { latestPrompt, previousUserPrompt, productFilter } = params;
  const parts: string[] = [];

  if (productFilter) {
    parts.push(`Prodotto: ${productFilter}`);
  }

  if (previousUserPrompt && isLikelyFollowUp(latestPrompt)) {
    parts.push(`Contesto precedente: ${truncateSnippet(previousUserPrompt, 220)}`);
    parts.push(`Domanda attuale: ${latestPrompt}`);
  } else {
    parts.push(latestPrompt);
  }

  return parts.join(' | ');
}

function sanitizePostgrestTerm(raw: string): string {
  return raw.replace(/[,()*\\'"%:]/g, '').trim();
}

export function extractLexicalSignals(query: string): LexicalSignals {
  const rawTokens = query.match(/[A-Za-zÀ-ÿ0-9]+(?:[-_.][A-Za-zÀ-ÿ0-9]+)*/g) ?? [];

  const codeTerms: string[] = [];
  const seenCodes = new Set<string>();
  const keywords: string[] = [];
  const seenKeywords = new Set<string>();

  for (const raw of rawTokens) {
    const clean = sanitizePostgrestTerm(raw);
    if (clean.length < 2) continue;

    const hasDigit = /\d/.test(clean);
    const hasConnector = /[-_]/.test(clean);
    const isUppercaseAcronym =
      clean.length >= 2 && clean.length <= 8 && clean === clean.toUpperCase() && /[A-Z]/.test(clean);

    if (hasDigit || hasConnector || isUppercaseAcronym) {
      const key = clean.toLowerCase();
      if (!seenCodes.has(key) && !ITALIAN_STOPWORDS.has(key)) {
        seenCodes.add(key);
        codeTerms.push(clean);
      }
      continue;
    }

    const lower = clean.toLowerCase();
    if (lower.length >= 4 && !ITALIAN_STOPWORDS.has(lower) && !seenKeywords.has(lower)) {
      seenKeywords.add(lower);
      keywords.push(lower);
    }
  }

  // Ordina le keyword per lunghezza decrescente (termini più specifici prima)
  keywords.sort((a, b) => b.length - a.length);

  const searchTerms: string[] = [];
  const seenCombined = new Set<string>();
  for (const term of [...codeTerms, ...keywords]) {
    const key = term.toLowerCase();
    if (seenCombined.has(key)) continue;
    seenCombined.add(key);
    searchTerms.push(term);
    if (searchTerms.length >= 4) break;
  }

  return { codeTerms, keywords, searchTerms };
}

function evaluateLexicalMatch(
  signals: LexicalSignals,
  titleFields: Array<string | null | undefined>,
  bodyText: string | null | undefined
): LexicalEvaluation {
  if (signals.searchTerms.length === 0) {
    return { hasCodeMatch: false, titleMatches: 0, bodyMatches: 0, coverage: 0 };
  }

  const titleJoined = titleFields.filter(Boolean).join(' ').toLowerCase();
  const bodyLower = (bodyText ?? '').toLowerCase();

  let hasCodeMatch = false;
  for (const code of signals.codeTerms) {
    const codeLower = code.toLowerCase();
    if (titleJoined.includes(codeLower) || bodyLower.includes(codeLower)) {
      hasCodeMatch = true;
      break;
    }
  }

  let titleMatches = 0;
  let bodyMatches = 0;
  let weightedPoints = 0;
  const maxPoints = signals.searchTerms.length * 2.5;

  for (const term of signals.searchTerms) {
    const lower = term.toLowerCase();
    const inTitle = titleJoined.includes(lower);
    const inBody = bodyLower.includes(lower);
    if (inTitle) {
      titleMatches++;
      weightedPoints += 2.5;
    } else if (inBody) {
      bodyMatches++;
      weightedPoints += 1.0;
    }
  }

  const rawCoverage = maxPoints > 0 ? weightedPoints / maxPoints : 0;
  const coverage = Math.min(1, hasCodeMatch ? Math.max(rawCoverage, 0.55) : rawCoverage);

  return { hasCodeMatch, titleMatches, bodyMatches, coverage };
}

function matchesProductSlots(row: KbProductLookupRow, targetLower: string): boolean {
  const slots = [
    row.prodotto_1,
    row.prodotto_2,
    row.prodotto_3,
    row.prodotto_4,
    row.prodotto_5,
    row.prodotto_6,
  ];
  return slots.some((slot) => slot?.trim().toLowerCase() === targetLower);
}

export interface HybridRagSearchParams {
  latestPrompt: string;
  previousUserPrompt: string;
  cercaKB: boolean;
  cercaManuali: boolean;
  productFilter: string | null;
  ragMatchThreshold: number;
}

export interface HybridRagSearchResult {
  kbData: KbMatchRow[];
  docData: DocMatchRow[];
}

interface ScoredItem<T> {
  row: T;
  score: number;
  hasCodeMatch: boolean;
}

export async function runHybridRagSearch(
  params: HybridRagSearchParams
): Promise<HybridRagSearchResult> {
  const {
    latestPrompt,
    previousUserPrompt,
    cercaKB,
    cercaManuali,
    productFilter,
    ragMatchThreshold,
  } = params;

  const admin = createAdminSupabaseClient();
  const retrievalQuery = buildRetrievalQuery({
    latestPrompt,
    previousUserPrompt,
    productFilter,
  });
  const lexicalSignals = extractLexicalSignals(
    isLikelyFollowUp(latestPrompt) && previousUserPrompt
      ? `${previousUserPrompt} ${latestPrompt}`
      : latestPrompt
  );

  const vectorMatchCount = productFilter ? 14 : 8;
  const queryEmbedding = await embedText(retrievalQuery, { taskType: 'RETRIEVAL_QUERY' });

  const kbOrClause =
    lexicalSignals.searchTerms.length > 0
      ? lexicalSignals.searchTerms
          .flatMap((term) => [
            `oggetto.ilike.%${term}%`,
            `numero_originale.ilike.%${term}%`,
            `riferimento.ilike.%${term}%`,
            `argomento.ilike.%${term}%`,
            `contenuto.ilike.%${term}%`,
          ])
          .join(',')
      : '';

  const docOrClause =
    lexicalSignals.searchTerms.length > 0
      ? lexicalSignals.searchTerms
          .flatMap((term) => [`capitolo.ilike.%${term}%`, `testo.ilike.%${term}%`])
          .join(',')
      : '';

  const runKbLexical = async (): Promise<KbLexicalRow[]> => {
    if (!cercaKB || !kbOrClause) return [];
    try {
      const { data, error } = await admin
        .from('knowledge_base')
        .select(
          'id, numero_originale, riferimento, classe, oggetto, tipologia, argomento, contenuto, prodotto_1, prodotto_2, prodotto_3, prodotto_4, prodotto_5, prodotto_6'
        )
        .or(kbOrClause)
        .limit(LEXICAL_LIMIT);

      if (error || !data) return [];
      return data as KbLexicalRow[];
    } catch {
      return [];
    }
  };

  const runDocLexical = async (): Promise<DocMatchRow[]> => {
    if (!cercaManuali || !docOrClause) return [];
    try {
      const { data, error } = await admin
        .from('documenti_chunk')
        .select('id, documento_id, capitolo, pagina, testo')
        .or(docOrClause)
        .limit(LEXICAL_LIMIT);

      if (error || !data || data.length === 0) return [];
      const chunks = data as DocChunkLexicalRow[];
      const docIds = Array.from(
        new Set(chunks.map((c) => String(c.documento_id)).filter(Boolean))
      );

      const docsMap = new Map<string, ParentDocRow>();
      if (docIds.length > 0) {
        const { data: parents } = await admin
          .from('documenti')
          .select('id, titolo, prodotto, pdf_url')
          .in('id', docIds);

        for (const p of (parents ?? []) as ParentDocRow[]) {
          docsMap.set(String(p.id), p);
        }
      }

      return chunks.map((chunk) => {
        const parent = docsMap.get(String(chunk.documento_id));
        return {
          id: chunk.id,
          titolo: parent?.titolo ?? null,
          prodotto: parent?.prodotto ?? null,
          capitolo: chunk.capitolo,
          pagina: chunk.pagina,
          pdf_url: parent?.pdf_url ?? null,
          testo: chunk.testo,
          similarity: null,
        };
      });
    } catch {
      return [];
    }
  };

  const [kbRpcResult, docRpcResult, rawKbLexical, rawDocLexical] = await Promise.all([
    cercaKB
      ? admin.rpc('match_knowledge_base', {
          query_embedding: queryEmbedding,
          match_threshold: ragMatchThreshold,
          match_count: vectorMatchCount,
        })
      : Promise.resolve({ data: null, error: null }),
    cercaManuali
      ? admin.rpc('match_documenti_chunk', {
          query_embedding: queryEmbedding,
          match_threshold: ragMatchThreshold,
          match_count: vectorMatchCount,
        })
      : Promise.resolve({ data: null, error: null }),
    runKbLexical(),
    runDocLexical(),
  ]);

  if (kbRpcResult.error) {
    console.error('Warning RPC Knowledge Base:', kbRpcResult.error.message);
  }
  if (docRpcResult.error) {
    console.error('Warning RPC Documenti:', docRpcResult.error.message);
  }

  let vectorKbRows = ((kbRpcResult.data ?? []) as KbMatchRow[]).filter(
    (row) => typeof row.similarity !== 'number' || row.similarity >= ragMatchThreshold
  );
  let vectorDocRows = ((docRpcResult.data ?? []) as DocMatchRow[]).filter(
    (row) => typeof row.similarity !== 'number' || row.similarity >= ragMatchThreshold
  );
  let filteredKbLexical = rawKbLexical;
  let filteredDocLexical = rawDocLexical;

  if (productFilter) {
    const targetLower = productFilter.toLowerCase();

    vectorDocRows = vectorDocRows.filter(
      (d) => (d.prodotto?.trim().toLowerCase() ?? '') === targetLower
    );
    filteredDocLexical = filteredDocLexical.filter(
      (d) => (d.prodotto?.trim().toLowerCase() ?? '') === targetLower
    );
    filteredKbLexical = filteredKbLexical.filter((k) => matchesProductSlots(k, targetLower));

    if (vectorKbRows.length > 0) {
      const kbIds = vectorKbRows
        .map((k) => k.id)
        .filter((id): id is string | number => id !== undefined && id !== null);

      if (kbIds.length > 0) {
        const { data: kbProducts } = await admin
          .from('knowledge_base')
          .select('id, prodotto_1, prodotto_2, prodotto_3, prodotto_4, prodotto_5, prodotto_6')
          .in('id', kbIds);

        if (kbProducts) {
          const matchingIds = new Set<string>();
          for (const row of kbProducts as KbProductLookupRow[]) {
            if (matchesProductSlots(row, targetLower)) {
              matchingIds.add(String(row.id));
            }
          }
          vectorKbRows = vectorKbRows.filter((item) =>
            item.id !== undefined && item.id !== null ? matchingIds.has(String(item.id)) : false
          );
        }
      }
    }
  }

  // Fusione e deduplicazione KB (vettore + lessicale)
  const kbMerged = new Map<string, ScoredItem<KbMatchRow>>();

  for (const row of vectorKbRows) {
    const key =
      row.id !== undefined && row.id !== null
        ? `id:${String(row.id)}`
        : `${row.numero_originale ?? ''}|${row.oggetto ?? ''}|${row.riferimento ?? ''}`;
    const lexical = evaluateLexicalMatch(
      lexicalSignals,
      [row.numero_originale, row.riferimento, row.oggetto, row.argomento],
      row.contenuto
    );
    const vecSim = typeof row.similarity === 'number' ? row.similarity : ragMatchThreshold;
    const score = Math.min(1, vecSim + 0.14 * lexical.coverage);
    kbMerged.set(key, {
      row: { ...row, similarity: score },
      score,
      hasCodeMatch: lexical.hasCodeMatch,
    });
  }

  for (const lexRow of filteredKbLexical) {
    const key = `id:${String(lexRow.id)}`;
    if (kbMerged.has(key)) continue;

    const lexical = evaluateLexicalMatch(
      lexicalSignals,
      [lexRow.numero_originale, lexRow.riferimento, lexRow.oggetto, lexRow.argomento, lexRow.classe],
      lexRow.contenuto
    );

    const passesStrictGate =
      lexical.hasCodeMatch || lexical.titleMatches >= 1 || lexical.bodyMatches >= 2;
    if (!passesStrictGate) continue;

    const score = Math.min(
      0.84,
      Math.max(ragMatchThreshold + 0.03, 0.58 + 0.24 * lexical.coverage)
    );
    kbMerged.set(key, {
      row: {
        id: lexRow.id,
        numero_originale: lexRow.numero_originale,
        riferimento: lexRow.riferimento,
        oggetto: lexRow.oggetto,
        tipologia: lexRow.tipologia,
        argomento: lexRow.argomento,
        contenuto: lexRow.contenuto,
        similarity: score,
      },
      score,
      hasCodeMatch: lexical.hasCodeMatch,
    });
  }

  // Fusione e deduplicazione Manuali PDF (vettore + lessicale)
  const docMerged = new Map<string, ScoredItem<DocMatchRow>>();

  for (const row of vectorDocRows) {
    const key =
      row.id !== undefined && row.id !== null
        ? `id:${String(row.id)}`
        : `${row.titolo ?? ''}|${row.capitolo ?? ''}|${row.pagina ?? ''}`;
    const lexical = evaluateLexicalMatch(
      lexicalSignals,
      [row.titolo, row.capitolo, row.prodotto],
      row.testo
    );
    const vecSim = typeof row.similarity === 'number' ? row.similarity : ragMatchThreshold;
    const score = Math.min(1, vecSim + 0.14 * lexical.coverage);
    docMerged.set(key, {
      row: { ...row, similarity: score },
      score,
      hasCodeMatch: lexical.hasCodeMatch,
    });
  }

  for (const lexRow of filteredDocLexical) {
    const key =
      lexRow.id !== undefined && lexRow.id !== null
        ? `id:${String(lexRow.id)}`
        : `${lexRow.titolo ?? ''}|${lexRow.capitolo ?? ''}|${lexRow.pagina ?? ''}`;
    if (docMerged.has(key)) continue;

    const lexical = evaluateLexicalMatch(
      lexicalSignals,
      [lexRow.titolo, lexRow.capitolo, lexRow.prodotto],
      lexRow.testo
    );

    const passesStrictGate =
      lexical.hasCodeMatch || lexical.titleMatches >= 1 || lexical.bodyMatches >= 2;
    if (!passesStrictGate) continue;

    const score = Math.min(
      0.84,
      Math.max(ragMatchThreshold + 0.03, 0.58 + 0.24 * lexical.coverage)
    );
    docMerged.set(key, {
      row: { ...lexRow, similarity: score },
      score,
      hasCodeMatch: lexical.hasCodeMatch,
    });
  }

  const allScored = [...kbMerged.values(), ...docMerged.values()];
  const bestOverallScore =
    allScored.length > 0 ? Math.max(...allScored.map((item) => item.score)) : null;

  const finalize = <T>(items: Iterable<ScoredItem<T>>): T[] => {
    const arr = Array.from(items).filter((item) => {
      if (bestOverallScore === null) return true;
      if (item.hasCodeMatch) return true;
      const drop = bestOverallScore - item.score;
      return !(drop > MAX_SIMILARITY_DROP && item.score < HIGH_CONFIDENCE_SIMILARITY);
    });

    arr.sort((a, b) => b.score - a.score);
    return arr.slice(0, FINAL_TOP_PER_SOURCE).map((item) => item.row);
  };

  return {
    kbData: finalize(kbMerged.values()),
    docData: finalize(docMerged.values()),
  };
}
