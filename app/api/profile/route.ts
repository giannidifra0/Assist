import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isNonEmptyString } from '@/lib/security/validation';
import { normalizeRole } from '@/lib/auth/roles';

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json().catch(() => null)) as {
      nominativo?: unknown;
      password?: unknown;
    } | null;

    if (!body || !isNonEmptyString(body.nominativo, 2, 120)) {
      return NextResponse.json(
        { success: false, error: 'Il nominativo deve contenere tra 2 e 120 caratteri.' },
        { status: 400 }
      );
    }

    const nominativo = body.nominativo.trim();
    const password = typeof body.password === 'string' ? body.password : '';

    if (password.length > 0 && password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'La nuova password deve contenere almeno 8 caratteri.' },
        { status: 400 }
      );
    }

    if (password.length > 0) {
      const supabase = await createServerSupabaseClient();
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) {
        return NextResponse.json(
          { success: false, error: `Errore aggiornamento password: ${authError.message}` },
          { status: 400 }
        );
      }
    }

    const admin = createAdminSupabaseClient();
    const { data, error: dbError } = await admin
      .from('utenti')
      .update({ nominativo })
      .eq('id', auth.user.id)
      .select('id, email, username, nominativo, ruolo, attivo')
      .single();

    if (dbError || !data) {
      throw new Error(dbError?.message || 'Impossibile aggiornare il profilo.');
    }

    return NextResponse.json({
      success: true,
      user: {
        id: data.id,
        email: data.email,
        username: data.username,
        nominativo: data.nominativo,
        ruolo: normalizeRole(data.ruolo),
        attivo: Boolean(data.attivo),
      },
    });
  } catch (error: unknown) {
    console.error('Errore API profile:', error);
    const message = error instanceof Error ? error.message : 'Errore interno aggiornamento profilo.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
