import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isValidId, sanitizeOptionalText } from '@/lib/security/validation';

export async function POST(req: Request) {
  const auth = await requireAuth('chat:use');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json().catch(() => null)) as {
      messageId?: unknown;
      feedback?: unknown;
      note?: unknown;
    } | null;

    if (
      !body ||
      !isValidId(body.messageId) ||
      (body.feedback !== 1 && body.feedback !== -1 && body.feedback !== null)
    ) {
      return NextResponse.json(
        { success: false, error: 'Parametri feedback non validi.' },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();
    const note = sanitizeOptionalText(body.note, 500);

    const { error } = await admin
      .from('chat_messages')
      .update({
        feedback: body.feedback,
        feedback_note: note || null,
      })
      .eq('id', body.messageId.trim())
      .eq('utente_id', auth.user.id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, feedback: body.feedback });
  } catch (error: unknown) {
    console.error('Errore POST /api/chat/feedback:', error);
    const message = error instanceof Error ? error.message : 'Errore salvataggio feedback.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
