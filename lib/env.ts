export interface PublicSupabaseEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface ServerEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  geminiApiKey: string;
  llamaparseApiKey: string;
  geminiModelEco: string;
  geminiModelAdvanced: string;
  geminiModelFallback: string;
  geminiEmbeddingModel: string;
  ragMatchThreshold: number;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variabile d'ambiente obbligatoria mancante: ${name}`);
  }
  return value;
}

function parseRagThreshold(raw: string | undefined): number {
  if (!raw) return 0.55;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0.55;
  return Math.min(0.9, Math.max(0.35, parsed));
}

export function getPublicSupabaseEnv(): PublicSupabaseEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Configurazione Supabase pubblica mancante (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).'
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function getServerEnv(): ServerEnv {
  const { supabaseUrl } = getPublicSupabaseEnv();

  return {
    supabaseUrl,
    supabaseServiceRoleKey: readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    geminiApiKey: readRequiredEnv('GEMINI_API_KEY'),
    llamaparseApiKey: readRequiredEnv('LLAMAPARSE_API_KEY'),
    geminiModelEco: process.env.GEMINI_MODEL_ECO?.trim() || 'gemini-3.5-flash-lite',
    geminiModelAdvanced: process.env.GEMINI_MODEL_ADVANCED?.trim() || 'gemini-3.8-flash',
    geminiModelFallback: process.env.GEMINI_MODEL_FALLBACK?.trim() || 'gemini-2.5-flash-lite',
    geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001',
    ragMatchThreshold: parseRagThreshold(process.env.RAG_MATCH_THRESHOLD),
  };
}
