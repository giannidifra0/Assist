export type UserRole = 'admin' | 'editor' | 'utente';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  nominativo: string;
  ruolo: UserRole;
  attivo: boolean;
  is_online?: boolean;
}

export interface KnowledgeItem {
  id: string;
  numero_originale: string;
  riferimento: string;
  classe: string;
  oggetto: string;
  tipologia: string;
  argomento: string;
  contenuto: string;
  data_pubblicazione: string;
  prodotto_1: string;
  prodotto_2: string;
  prodotto_3: string;
  prodotto_4: string;
  prodotto_5: string;
  prodotto_6: string;
  ha_embedding?: boolean;
}

export type KnowledgeEmbeddingFilter = 'all' | 'synced' | 'pending';

export interface KnowledgeFormPayload {
  numero_originale: string;
  riferimento: string;
  data_pubblicazione: string;
  classe: string;
  tipologia: string;
  argomento: string;
  prodotto_1: string;
  prodotto_2: string;
  prodotto_3: string;
  prodotto_4: string;
  prodotto_5: string;
  prodotto_6: string;
  oggetto: string;
  contenuto: string;
}

export interface ManualDocument {
  id: string;
  titolo: string;
  prodotto: string;
  versione: string;
  pdf_url?: string | null;
  created_at: string;
}

export interface ManualChunk {
  id: string;
  documento_id: string;
  capitolo: string;
  pagina: number;
  testo: string;
}

export interface ParsedChunk {
  capitolo: string;
  pagina: number;
  testo: string;
}

export type ChatScope = 'both' | 'kb' | 'manuals';

export type ChatModelMode = 'eco' | 'advanced';

export interface ChatSource {
  type: 'kb' | 'manual';
  title: string;
  subtitle?: string;
  pdfFile?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  sources?: ChatSource[];
  feedback?: 1 | -1 | null;
  meta?: {
    model: string;
    fallbackUsed?: boolean;
    totalTokens?: number;
  };
}

export interface ChatSession {
  id: string;
  titolo: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  knowledge: number;
  manuals: number;
  tickets: number;
  usersOnline: number;
  pendingEmbeddings: number;
  pendingKbEmbeddings?: number;
  pendingManualChunks?: number;
}

export type EmbeddingSyncTarget = 'knowledge' | 'manuals';
export type EmbeddingSyncMode = 'pending' | 'all';

export interface EmbeddingSyncCounts {
  knowledgeTotal: number;
  knowledgePending: number;
  manualChunksTotal: number;
  manualChunksPending: number;
}

export interface EmbeddingSyncBatchResponse {
  success: boolean;
  target: EmbeddingSyncTarget;
  mode: EmbeddingSyncMode;
  processed: number;
  skipped: number;
  failed: number;
  remaining: number;
  totalPendingInDb?: number;
  hasMore: boolean;
  lastId: string | null;
  durationMs: number;
  message: string;
  error?: string;
}

export type TelemetryRange = 'today' | '7d' | '30d' | 'all';

export interface ModelTelemetryRow {
  model: string;
  requests: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface UserTelemetryRow {
  userId: string;
  name: string;
  requests: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface TelemetrySummary {
  requests: number;
  totalTokens: number;
  promptTokens: number;
  responseTokens: number;
  successRate: number;
  estimatedCostUsd: number;
  byModel: ModelTelemetryRow[];
  byUser: UserTelemetryRow[];
  feedback: {
    positive: number;
    negative: number;
  };
}
