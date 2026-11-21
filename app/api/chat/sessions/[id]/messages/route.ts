import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isValidId } from '@/lib/security/validation';
import type { ChatMessage, ChatSource } from '@/lib/types/domain';

interface DbMessageRow {
  id: string;
  role: 'user' | 'ai';
  content: string;
  sources: ChatSource[] | null;
  meta: ChatMessage['meta'] | null;
  feedback: 1 | -1 | null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth('chat:use');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return NextResponse.json({ success: false, error: 'ID sessione non valido.' }, { status: 400 });
    }

    const sessionId = id.trim();
    const admin = createAdminSupabaseClient();

    const { data: sessionRow, error: sessionErr } = await admin
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('utente_id', auth.user.id)
      .maybeSingle();

    if (sessionErr) {
      throw new Error(sessionErr.message);
    }

    if (!sessionRow) {
      return NextResponse.json(
        { success: false, error: 'Conversazione non trovata.' },
        { status: 404 }
      );
    }

    const { data, error } = await admin
      .from('chat_messages')
      .select('id, role, content, sources, meta, feedback')
      .eq('session_id', sessionId)
      .eq('utente_id', auth.user.id)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const messages: ChatMessage[] = ((data ?? []) as DbMessageRow[]).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      sources: Array.isArray(row.sources) ? row.sources : undefined,
      meta: row.meta ?? undefined,
      feedback: row.feedback ?? null,
    }));

    return NextResponse.json({ success: true, messages });
  } catch (error: unknown) {
    console.error('Errore GET /api/chat/sessions/[id]/messages:', error);
    const message = error instanceof Error ? error.message : 'Errore caricamento messaggi.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
