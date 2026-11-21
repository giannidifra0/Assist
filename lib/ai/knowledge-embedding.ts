import 'server-only';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { embedText } from '@/lib/ai/gemini';

const MAX_EMBED_CHARS = 7200;

export interface KnowledgeEmbeddingFields {
  numero_originale?: string | null;
  riferimento?: string | null;
  data_pubblicazione?: string | null;
  classe?: string | null;
  tipologia?: string | null;
  argomento?: string | null;
  prodotto_1?: string | null;
  prodotto_2?: string | null;
  prodotto_3?: string | null;
  prodotto_4?: string | null;
  prodotto_5?: string | null;
  prodotto_6?: string | null;
  oggetto?: string | null;
  contenuto?: string | null;
}

export interface ManualChunkEmbeddingFields {
  titolo?: string | null;
  prodotto?: string | null;
  versione?: string | null;
  capitolo?: string | null;
  pagina?: number | null;
  testo?: string | null;
}

/**
 * Normalizza testo grezzo o HTML leggero (importato da ticket/CSV/portali) prima dell'embedding.
 */
export function normalizeTextForEmbedding(raw: string): string {
  if (!raw) return '';
  let text = raw.normalize('NFKC');

  // Converte interruzioni HTML comuni in a-capo prima di rimuovere i tag residui
  text = text.replace(/<br\s*\/?>|<\/(?:p|div|li|tr|h[1-6])>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');

  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");

  // Rimuove caratteri invisibili e di controllo mantenendo \n e \t
  text = text.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Mantiene il corpo entro il budget di caratteri preservando testa (80%) e coda (~18%)
 * così i metadati in cima e le note risolutive finali restano sempre nell'embedding.
 */
export function capEmbeddingBody(body: string, maxChars: number): string {
  if (!body || body.length <= maxChars) return body;
  if (maxChars < 120) return body.slice(0, maxChars).trim();

  const headBudget = Math.floor(maxChars * 0.8);
  const tailBudget = Math.max(80, Math.floor(maxChars * 0.18));
  const head = body.slice(0, headBudget).trimEnd();
  const tail = body.slice(-tailBudget).trimStart();
  return `${head}\n[...]\n${tail}`;
}

export function buildKnowledgeEmbeddingText(scheda: KnowledgeEmbeddingFields): string {
  const headerLines: string[] = [];

  const oggetto = normalizeTextForEmbedding(scheda.oggetto ?? '');
  const codice = normalizeTextForEmbedding(scheda.numero_originale ?? '');
  const riferimento = normalizeTextForEmbedding(scheda.riferimento ?? '');
  const dataPub = normalizeTextForEmbedding(scheda.data_pubblicazione ?? '');

  if (oggetto) headerLines.push(`Titolo / Oggetto: ${oggetto}`);
  if (codice) headerLines.push(`Codice Scheda: ${codice}`);
  if (riferimento) headerLines.push(`Riferimento: ${riferimento}`);

  // Deduplica case-insensitive dei 6 slot prodotto
  const seenProducts = new Set<string>();
  const prodotti: string[] = [];
  const rawSlots = [
    scheda.prodotto_1,
    scheda.prodotto_2,
    scheda.prodotto_3,
    scheda.prodotto_4,
    scheda.prodotto_5,
    scheda.prodotto_6,
  ];
  for (const rawSlot of rawSlots) {
    const clean = normalizeTextForEmbedding(rawSlot ?? '');
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seenProducts.has(key)) continue;
    seenProducts.add(key);
    prodotti.push(clean);
  }
  if (prodotti.length > 0) {
    headerLines.push(`Prodotti Zucchetti: ${prodotti.join(', ')}`);
  }

  const classificazione = [scheda.classe, scheda.tipologia, scheda.argomento]
    .map((val) => normalizeTextForEmbedding(val ?? ''))
    .filter(Boolean)
    .join(' / ');
  if (classificazione) {
    headerLines.push(`Classificazione: ${classificazione}`);
  }

  if (dataPub) {
    headerLines.push(`Data Pubblicazione: ${dataPub}`);
  }

  const header = headerLines.join('\n');
  const contenuto = normalizeTextForEmbedding(scheda.contenuto ?? '');

  if (!header && !contenuto) return '';
  if (!contenuto) return header;

  const remainingBudget = Math.max(800, MAX_EMBED_CHARS - header.length - 40);
  const cappedBody = capEmbeddingBody(contenuto, remainingBudget);

  return header
    ? `${header}\nDescrizione e Soluzione Tecnica:\n${cappedBody}`
    : cappedBody;
}

export function buildManualChunkEmbeddingText(chunk: ManualChunkEmbeddingFields): string {
  const headerLines: string[] = [];

  const titolo = normalizeTextForEmbedding(chunk.titolo ?? '');
  const prodotto = normalizeTextForEmbedding(chunk.prodotto ?? '');
  const versione = normalizeTextForEmbedding(chunk.versione ?? '');
  const capitolo = normalizeTextForEmbedding(chunk.capitolo ?? '');
  const pagina =
    typeof chunk.pagina === 'number' && Number.isFinite(chunk.pagina) && chunk.pagina > 0
      ? Math.trunc(chunk.pagina)
      : null;

  if (titolo) headerLines.push(`Manuale: ${titolo}`);
  if (prodotto) headerLines.push(`Prodotto: ${prodotto}`);
  if (versione) headerLines.push(`Versione: ${versione}`);
  if (capitolo || pagina) {
    const sec = capitolo || 'Sezione';
    headerLines.push(`Sezione / Capitolo: ${sec}${pagina ? ` (Pagina ${pagina})` : ''}`);
  }

  const header = headerLines.join('\n');
  const testo = normalizeTextForEmbedding(chunk.testo ?? '');

  if (!header && !testo) return '';
  if (!testo) return header;

  const remainingBudget = Math.max(800, MAX_EMBED_CHARS - header.length - 30);
  const cappedBody = capEmbeddingBody(testo, remainingBudget);

  return header ? `${header}\nContenuto Tecnico:\n${cappedBody}` : cappedBody;
}

export async function embedAndSaveKnowledge(
  id: string,
  scheda: KnowledgeEmbeddingFields
): Promise<boolean> {
  const textToEmbed = buildKnowledgeEmbeddingText(scheda);
  if (!textToEmbed) return false;

  try {
    const title = normalizeTextForEmbedding(scheda.oggetto ?? '') || undefined;
    const vector = await embedText(textToEmbed, {
      taskType: 'RETRIEVAL_DOCUMENT',
      title,
    });
    const admin = createAdminSupabaseClient();
    const { error } = await admin
      .from('knowledge_base')
      .update({ embedding: vector })
      .eq('id', id);

    if (error) {
      console.error(`Auto-embedding KB ${id} non salvato:`, error.message);
      return false;
    }
    return true;
  } catch (error: unknown) {
    console.error(`Auto-embedding KB ${id} fallito:`, error);
    return false;
  }
}
