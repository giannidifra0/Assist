-- ============================================================================
-- Z-Assist: Migrazione 03 — Indici Postgres per Coda Embedding & Ricerca Ibrida RAG
-- Eseguire nel SQL Editor di Supabase (Dashboard -> SQL Editor -> New query)
-- Compatibile con qualsiasi tipo di ID e dimensione del vettore (vector(N)).
-- ============================================================================

BEGIN;

-- Abilita pg_trgm per accelerare le query lessicali (.ilike / %termine%) nella ricerca ibrida RAG
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indici parziali sui soli record ancora da vettorizzare (velocizza stats & coda batch)
CREATE INDEX IF NOT EXISTS idx_knowledge_base_pending_embedding
  ON public.knowledge_base (id)
  WHERE embedding IS NULL;

CREATE INDEX IF NOT EXISTS idx_documenti_chunk_pending_embedding
  ON public.documenti_chunk (id)
  WHERE embedding IS NULL;

-- Indici GIN trigram su metadati chiave della Knowledge Base
CREATE INDEX IF NOT EXISTS idx_kb_trgm_oggetto
  ON public.knowledge_base USING gin (oggetto gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_kb_trgm_numero_originale
  ON public.knowledge_base USING gin (numero_originale gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_kb_trgm_riferimento
  ON public.knowledge_base USING gin (riferimento gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_kb_trgm_argomento
  ON public.knowledge_base USING gin (argomento gin_trgm_ops);

-- Indici GIN trigram sui contenuti dei manuali PDF
CREATE INDEX IF NOT EXISTS idx_doc_chunk_trgm_capitolo
  ON public.documenti_chunk USING gin (capitolo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_doc_chunk_trgm_testo
  ON public.documenti_chunk USING gin (testo gin_trgm_ops);

COMMIT;
