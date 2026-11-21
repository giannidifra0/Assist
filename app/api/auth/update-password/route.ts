import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Link scaduto o sessione non valida. Richiedi un nuovo reset password.',
        },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
    const password = typeof body?.password === 'string' ? body.password : '';

    if (password.length < 8 || password.length > 256) {
      return NextResponse.json(
        { success: false, error: 'La nuova password deve contenere almeno 8 caratteri.' },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      return NextResponse.json(
        { success: false, error: `Impossibile aggiornare la password: ${updateErr.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Errore API update-password:', error);
    return NextResponse.json(
      { success: false, error: 'Errore interno durante il salvataggio password.' },
      { status: 500 }
    );
  }
}
