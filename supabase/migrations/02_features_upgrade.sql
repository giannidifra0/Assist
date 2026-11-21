-- ============================================================================
-- Z-Assist: Migrazione 02 — Telemetria Estesa, Cronologia Chat, Feedback e Rate Limit
-- Eseguire nel SQL Editor di Supabase (Dashboard -> SQL Editor -> New query)
-- Requisito: aver già eseguito 01_cleanup_contracts_and_harden_security.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TELEMETRIA ESTESA PER UTENTE E MODELLO
-- ============================================================================
ALTER TABLE public.telemetria_ia
  ADD COLUMN IF NOT EXISTS utente_id uuid,
  ADD COLUMN IF NOT EXISTS modello text,
  ADD COLUMN IF NOT EXISTS modalita text;

CREATE INDEX IF NOT EXISTS idx_telemetria_ia_data
  ON public.telemetria_ia (data_richiesta DESC);

CREATE INDEX IF NOT EXISTS idx_telemetria_ia_utente
  ON public.telemetria_ia (utente_id);

-- ============================================================================
-- 2. CRONOLOGIA CHAT MULTI-CONVERSAZIONE E FEEDBACK RISPOSTE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utente_id uuid NOT NULL,
  titolo text NOT NULL DEFAULT 'Nuova conversazione',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  utente_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'ai')),
  content text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta jsonb,
  feedback smallint CHECK (feedback IN (-1, 1)),
  feedback_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_utente_updated
  ON public.chat_sessions (utente_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
  ON public.chat_messages (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_feedback
  ON public.chat_messages (feedback)
  WHERE feedback IS NOT NULL;

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_sessions_owner_all ON public.chat_sessions;
CREATE POLICY chat_sessions_owner_all
  ON public.chat_sessions
  FOR ALL
  TO authenticated
  USING (
    public.is_active_user()
    AND utente_id = auth.uid()
  )
  WITH CHECK (
    public.is_active_user()
    AND utente_id = auth.uid()
  );

DROP POLICY IF EXISTS chat_messages_owner_all ON public.chat_messages;
CREATE POLICY chat_messages_owner_all
  ON public.chat_messages
  FOR ALL
  TO authenticated
  USING (
    public.is_active_user()
    AND utente_id = auth.uid()
  )
  WITH CHECK (
    public.is_active_user()
    AND utente_id = auth.uid()
  );

DROP POLICY IF EXISTS chat_messages_admin_read_feedback ON public.chat_messages;
CREATE POLICY chat_messages_admin_read_feedback
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ============================================================================
-- 3. RATE LIMITING DISTRIBUITO (PERSISTENTE TRA COLD START SERVERLESS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  hits integer NOT NULL DEFAULT 1,
  reset_at timestamptz NOT NULL
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- Nessuna policy per anon/authenticated: accesso consentito solo via service_role

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after_sec integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_window interval := make_interval(secs => GREATEST(1, p_window_seconds));
  v_hits integer;
  v_reset timestamptz;
BEGIN
  IF random() < 0.05 THEN
    DELETE FROM public.rate_limits WHERE reset_at < v_now - interval '1 hour';
  END IF;

  INSERT INTO public.rate_limits (key, hits, reset_at)
  VALUES (p_key, 1, v_now + v_window)
  ON CONFLICT (key) DO UPDATE
  SET
    hits = CASE
      WHEN public.rate_limits.reset_at <= v_now THEN 1
      ELSE public.rate_limits.hits + 1
    END,
    reset_at = CASE
      WHEN public.rate_limits.reset_at <= v_now THEN v_now + v_window
      ELSE public.rate_limits.reset_at
    END
  RETURNING public.rate_limits.hits, public.rate_limits.reset_at
  INTO v_hits, v_reset;

  IF v_hits > GREATEST(1, p_limit) THEN
    RETURN QUERY SELECT
      false,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_reset - v_now)))::integer);
  ELSE
    RETURN QUERY SELECT true, 0;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

COMMIT;
