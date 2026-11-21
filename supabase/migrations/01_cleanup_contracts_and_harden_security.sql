-- ============================================================================
-- Z-Assist: Rimozione completa sezione Contrattualistica (CNEL) & Hardening RLS
-- Eseguire questo script nel SQL Editor di Supabase (Dashboard -> SQL Editor)
-- ============================================================================

-- (Opzionale) Query diagnostica preliminare: eseguila da sola prima della transazione
-- se vuoi verificare se esistono altre tabelle/viste legate a CNEL o contratti:
-- SELECT table_schema, table_name, table_type
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND (table_name ILIKE '%cnel%' OR table_name ILIKE '%contratt%' OR table_name ILIKE '%ccnl%');

BEGIN;

-- ============================================================================
-- 1. ELIMINAZIONE VISTA E TABELLA CONTRATTUALISTICA (CNEL)
-- ============================================================================
DROP VIEW IF EXISTS public.vista_cnel_contratti CASCADE;
DROP TABLE IF EXISTS public.cnel_contratti CASCADE;

-- ============================================================================
-- 2. OTTIMIZZAZIONE RUOLI SU public.utenti ('admin', 'editor', 'utente')
-- ============================================================================
-- Normalizza eventuali valori legacy con spazi o maiuscole
UPDATE public.utenti
SET ruolo = LOWER(TRIM(ruolo))
WHERE ruolo IS NOT NULL AND ruolo <> LOWER(TRIM(ruolo));

-- Se esiste già un check constraint sul ruolo, lo aggiorniamo in modo idempotente
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON t.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND t.relname = 'utenti'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%ruolo%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.utenti DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.utenti
  DROP CONSTRAINT IF EXISTS utenti_ruolo_check;

ALTER TABLE public.utenti
  ADD CONSTRAINT utenti_ruolo_check
  CHECK (ruolo IN ('admin', 'editor', 'utente'));

-- ============================================================================
-- 3. FUNZIONI HELPER PER RLS (SECURITY DEFINER, NON RICORSIVE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ruolo
  FROM public.utenti
  WHERE attivo = true
    AND (
      id = auth.uid()
      OR LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    )
  ORDER BY (id = auth.uid()) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.utenti
    WHERE attivo = true
      AND (
        id = auth.uid()
        OR LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated, service_role;

-- ============================================================================
-- 4. ATTIVAZIONE ROW LEVEL SECURITY (RLS) E PULIZIA POLICY PERMISSIVE
-- ============================================================================
ALTER TABLE public.utenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documenti_chunk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetria_ia ENABLE ROW LEVEL SECURITY;

-- Rimuove eventuali policy vecchie o troppo permissive create in fase di prototipo
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('utenti', 'knowledge_base', 'documenti', 'documenti_chunk', 'telemetria_ia')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- ---- public.utenti ----
-- Un utente attivo può leggere il proprio profilo; gli admin possono leggere tutti i profili.
-- Tutte le scritture passano dal backend Next.js autenticato via service_role.
CREATE POLICY utenti_select_self_or_admin
  ON public.utenti
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    OR public.current_user_role() = 'admin'
  );

-- ---- public.knowledge_base ----
CREATE POLICY kb_select_active_users
  ON public.knowledge_base
  FOR SELECT
  TO authenticated
  USING (public.is_active_user());

CREATE POLICY kb_write_admin_or_editor
  ON public.knowledge_base
  FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- ---- public.documenti ----
CREATE POLICY documenti_select_active_users
  ON public.documenti
  FOR SELECT
  TO authenticated
  USING (public.is_active_user());

CREATE POLICY documenti_write_admin_or_editor
  ON public.documenti
  FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- ---- public.documenti_chunk ----
CREATE POLICY documenti_chunk_select_active_users
  ON public.documenti_chunk
  FOR SELECT
  TO authenticated
  USING (public.is_active_user());

CREATE POLICY documenti_chunk_write_admin_or_editor
  ON public.documenti_chunk
  FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- ---- public.telemetria_ia ----
CREATE POLICY telemetria_select_admin_only
  ON public.telemetria_ia
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ============================================================================
-- 5. PROTEZIONE BUCKET STORAGE 'manuali_pdf'
-- ============================================================================
-- Rende il bucket privato (i download passano solo da /api/download autenticato)
UPDATE storage.buckets
SET public = false
WHERE id = 'manuali_pdf';

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (policyname ILIKE '%manuali%' OR policyname ILIKE '%public%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Consente lettura solo ad utenti autenticati attivi (anche se il backend usa /api/download)
CREATE POLICY manuali_pdf_authenticated_read
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'manuali_pdf'
    AND public.is_active_user()
  );

-- Consente upload/delete solo ad admin ed editor
CREATE POLICY manuali_pdf_admin_editor_write
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'manuali_pdf'
    AND public.current_user_role() IN ('admin', 'editor')
  )
  WITH CHECK (
    bucket_id = 'manuali_pdf'
    AND public.current_user_role() IN ('admin', 'editor')
  );

COMMIT;
