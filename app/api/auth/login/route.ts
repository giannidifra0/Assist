import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { checkRateLimitPersistent, getClientIp } from '@/lib/security/rate-limit';
import { isNonEmptyString, isValidEmail } from '@/lib/security/validation';
import { normalizeRole } from '@/lib/auth/roles';
import type { UserProfile } from '@/lib/types/domain';

interface DbUserRow {
  id: string;
  email: string;
  username: string;
  nominativo: string;
  ruolo: string;
  attivo: boolean;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const ipRate = await checkRateLimitPersistent(`login:ip:${ip}`, 10, 15 * 60_000);
    if (!ipRate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Troppi tentativi di accesso. Riprova tra ${ipRate.retryAfterSec} secondi.`,
        },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
    } | null;

    if (!body || !isValidEmail(body.email) || !isNonEmptyString(body.password, 1, 256)) {
      return NextResponse.json(
        { success: false, error: 'Inserisci un indirizzo email e una password validi.' },
        { status: 400 }
      );
    }

    const email = body.email.trim().toLowerCase();
    const password = body.password;

    const emailRate = await checkRateLimitPersistent(`login:email:${email}`, 8, 15 * 60_000);
    if (!emailRate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Troppi tentativi per questo account. Riprova tra ${emailRate.retryAfterSec} secondi.`,
        },
        { status: 429 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { success: false, error: 'Credenziali non valide o errate.' },
        { status: 401 }
      );
    }

    const admin = createAdminSupabaseClient();

    let { data: profile, error: dbError } = await admin
      .from('utenti')
      .select('id, email, username, nominativo, ruolo, attivo')
      .eq('id', authData.user.id)
      .maybeSingle<DbUserRow>();

    // Fallback per vecchi record creati manualmente prima dell'allineamento UUID
    if (!dbError && !profile) {
      const fallbackRes = await admin
        .from('utenti')
        .select('id, email, username, nominativo, ruolo, attivo')
        .eq('email', email)
        .maybeSingle<DbUserRow>();
      profile = fallbackRes.data;
      dbError = fallbackRes.error;
    }

    if (dbError) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { success: false, error: 'Errore nel recupero del profilo utente.' },
        { status: 500 }
      );
    }

    if (!profile) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { success: false, error: 'Profilo utente non configurato nel gestionale.' },
        { status: 403 }
      );
    }

    if (!profile.attivo) {
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          success: false,
          error: "Il tuo account è stato disabilitato dall'amministratore.",
        },
        { status: 403 }
      );
    }

    await admin.from('utenti').update({ is_online: true }).eq('id', profile.id);

    const safeUser: UserProfile = {
      id: profile.id,
      email: profile.email,
      username: profile.username,
      nominativo: profile.nominativo,
      ruolo: normalizeRole(profile.ruolo),
      attivo: profile.attivo,
    };

    return NextResponse.json({ success: true, user: safeUser });
  } catch (error: unknown) {
    console.error('Errore API login:', error);
    return NextResponse.json(
      { success: false, error: 'Errore interno durante il login.' },
      { status: 500 }
    );
  }
}
