import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isNonEmptyString, isValidId } from '@/lib/security/validation';
import type { ChatSession } from '@/lib/types/domain';

function isMissingRelationError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('does not exist') || lower.includes('relation') || lower.includes('schema cache');
}

export async function GET() {
  const auth = await requireAuth('chat:use');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from('chat_sessions')
      .select('id, titolo, created_at, updated_at')
      .eq('utente_id', auth.user.id)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      if (isMissingRelationError(error.message)) {
        return NextResponse.json({
          success: true,
          persistenceEnabled: false,
          sessions: [] as ChatSession[],
        });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      persistenceEnabled: true,
      sessions: (data ?? []) as ChatSession[],
    });
  } catch (error: unknown) {
    console.error('Errore GET /api/chat/sessions:', error);
    const message = error instanceof Error ? error.message : 'Errore caricamento conversazioni.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth('chat:use');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json().catch(() => ({}))) as { titolo?: unknown };
    const titolo = isNonEmptyString(body.titolo, 1, 120)
      ? body.titolo.trim()
      : 'Nuova conversazione';

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from('chat_sessions')
      .insert([{ utente_id: auth.user.id, titolo }])
      .select('id, titolo, created_at, updated_at')
      .single();

    if (error || !data) {
      if (error && isMissingRelationError(error.message)) {
        return NextResponse.json({ success: false, persistenceEnabled: false }, { status: 503 });
      }
      throw new Error(error?.message || 'Impossibile creare la conversazione.');
    }

    return NextResponse.json({
      success: true,
      session: data as ChatSession,
    });
  } catch (error: unknown) {
    console.error('Errore POST /api/chat/sessions:', error);
    const message = error instanceof Error ? error.message : 'Errore creazione conversazione.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAuth('chat:use');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json().catch(() => null)) as {
      id?: unknown;
      titolo?: unknown;
    } | null;

    if (!body || !isValidId(body.id) || !isNonEmptyString(body.titolo, 1, 120)) {
      return NextResponse.json(
        { success: false, error: 'ID sessione e titolo valido obbligatori.' },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();
    const { error } = await admin
      .from('chat_sessions')
      .update({ titolo: body.titolo.trim(), updated_at: new Date().toISOString() })
      .eq('id', body.id.trim())
      .eq('utente_id', auth.user.id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Errore PATCH /api/chat/sessions:', error);
    const message = error instanceof Error ? error.message : 'Errore aggiornamento conversazione.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAuth('chat:use');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const queryId = searchParams.get('id');
    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const targetId = queryId ?? body?.id;

    if (!isValidId(targetId)) {
      return NextResponse.json(
        { success: false, error: 'ID conversazione non valido.' },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();
    const { error } = await admin
      .from('chat_sessions')
      .delete()
      .eq('id', targetId.trim())
      .eq('utente_id', auth.user.id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Errore DELETE /api/chat/sessions:', error);
    const message = error instanceof Error ? error.message : 'Errore eliminazione conversazione.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
