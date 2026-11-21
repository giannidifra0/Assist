import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { calculateTokenCostUsd } from '@/lib/ai/pricing';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type {
  ModelTelemetryRow,
  TelemetryRange,
  TelemetrySummary,
  UserTelemetryRow,
} from '@/lib/types/domain';

interface TelemetryDbRow {
  totale_tokens: number | null;
  prompt_tokens: number | null;
  risposta_tokens: number | null;
  successo: boolean | null;
  utente_id?: string | null;
  modello?: string | null;
}

interface UserNameRow {
  id: string;
  nominativo: string;
}

function parseRange(value: string | null): TelemetryRange {
  if (value === 'today' || value === '7d' || value === '30d' || value === 'all') {
    return value;
  }
  return '7d';
}

function getRangeStartIso(range: TelemetryRange): string | null {
  if (range === 'all') return null;
  const date = new Date();
  if (range === 'today') {
    date.setHours(0, 0, 0, 0);
  } else if (range === '7d') {
    date.setDate(date.getDate() - 7);
  } else if (range === '30d') {
    date.setDate(date.getDate() - 30);
  }
  return date.toISOString();
}

export async function GET(req: Request) {
  const auth = await requireAuth('telemetry:read');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const range = parseRange(searchParams.get('range'));
    const startIso = getRangeStartIso(range);

    const admin = createAdminSupabaseClient();

    let extendedQuery = admin
      .from('telemetria_ia')
      .select('totale_tokens, prompt_tokens, risposta_tokens, successo, utente_id, modello');
    if (startIso) {
      extendedQuery = extendedQuery.gte('data_richiesta', startIso);
    }

    let rows: TelemetryDbRow[];
    const extendedRes = await extendedQuery;
    if (!extendedRes.error && extendedRes.data) {
      rows = extendedRes.data as TelemetryDbRow[];
    } else {
      // Fallback per database pre-migrazione 02
      let legacyQuery = admin
        .from('telemetria_ia')
        .select('totale_tokens, prompt_tokens, risposta_tokens, successo');
      if (startIso) {
        legacyQuery = legacyQuery.gte('data_richiesta', startIso);
      }
      const legacyRes = await legacyQuery;
      if (legacyRes.error) {
        throw new Error(legacyRes.error.message);
      }
      rows = (legacyRes.data ?? []) as TelemetryDbRow[];
    }

    const requests = rows.length;
    const successCount = rows.filter((row) => Boolean(row.successo)).length;
    let promptTokens = 0;
    let responseTokens = 0;
    let totalTokens = 0;
    let estimatedCostUsd = 0;

    const modelMap = new Map<string, ModelTelemetryRow>();
    const userMap = new Map<string, { requests: number; totalTokens: number; cost: number }>();

    for (const row of rows) {
      const pTok = row.prompt_tokens ?? 0;
      const rTok = row.risposta_tokens ?? 0;
      const tTok = row.totale_tokens ?? pTok + rTok;
      const modelName = row.modello?.trim() || 'legacy / non registrato';
      const rowCost = calculateTokenCostUsd(row.modello, pTok, rTok);

      promptTokens += pTok;
      responseTokens += rTok;
      totalTokens += tTok;
      estimatedCostUsd += rowCost;

      const prevModel = modelMap.get(modelName) ?? {
        model: modelName,
        requests: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      };
      prevModel.requests += 1;
      prevModel.totalTokens += tTok;
      prevModel.estimatedCostUsd = Number((prevModel.estimatedCostUsd + rowCost).toFixed(5));
      modelMap.set(modelName, prevModel);

      if (row.utente_id) {
        const prevUser = userMap.get(row.utente_id) ?? { requests: 0, totalTokens: 0, cost: 0 };
        prevUser.requests += 1;
        prevUser.totalTokens += tTok;
        prevUser.cost += rowCost;
        userMap.set(row.utente_id, prevUser);
      }
    }

    const byUser: UserTelemetryRow[] = [];
    if (userMap.size > 0) {
      const userIds = Array.from(userMap.keys());
      const { data: userNames } = await admin
        .from('utenti')
        .select('id, nominativo')
        .in('id', userIds);

      const nameLookup = new Map<string, string>();
      for (const u of (userNames ?? []) as UserNameRow[]) {
        nameLookup.set(u.id, u.nominativo);
      }

      for (const [uid, stats] of userMap.entries()) {
        byUser.push({
          userId: uid,
          name: nameLookup.get(uid) || uid.slice(0, 8),
          requests: stats.requests,
          totalTokens: stats.totalTokens,
          estimatedCostUsd: Number(stats.cost.toFixed(5)),
        });
      }
      byUser.sort((a, b) => b.totalTokens - a.totalTokens);
    }

    // Conteggio feedback risposte IA (resiliente se chat_messages non esiste ancora)
    let positiveFeedback = 0;
    let negativeFeedback = 0;
    try {
      let fbQuery = admin
        .from('chat_messages')
        .select('feedback')
        .not('feedback', 'is', null);
      if (startIso) {
        fbQuery = fbQuery.gte('created_at', startIso);
      }
      const fbRes = await fbQuery;
      if (!fbRes.error && fbRes.data) {
        for (const item of fbRes.data as Array<{ feedback: number | null }>) {
          if (item.feedback === 1) positiveFeedback++;
          if (item.feedback === -1) negativeFeedback++;
        }
      }
    } catch {
      // Tabella non ancora creata
    }

    const byModel = Array.from(modelMap.values()).sort((a, b) => b.totalTokens - a.totalTokens);

    const summary: TelemetrySummary = {
      requests,
      totalTokens,
      promptTokens,
      responseTokens,
      successRate: requests > 0 ? Math.round((successCount / requests) * 100) : 100,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
      byModel,
      byUser,
      feedback: {
        positive: positiveFeedback,
        negative: negativeFeedback,
      },
    };

    return NextResponse.json({ success: true, telemetry: summary });
  } catch (error: unknown) {
    console.error('Errore API telemetry:', error);
    const message = error instanceof Error ? error.message : 'Errore lettura telemetria.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
