import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { isValidRole, normalizeRole } from '@/lib/auth/roles';
import { isNonEmptyString, isValidEmail, isValidId } from '@/lib/security/validation';
import type { UserProfile } from '@/lib/types/domain';

interface DbUserRow {
  id: string;
  email: string;
  username: string;
  ruolo: string;
  attivo: boolean;
  nominativo: string;
  is_online?: boolean;
}

export async function GET() {
  const auth = await requireAuth('users:manage');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from('utenti')
      .select('id, email, username, ruolo, attivo, nominativo, is_online')
      .order('nominativo', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const users: UserProfile[] = ((data ?? []) as DbUserRow[]).map((row) => ({
      id: row.id,
      email: row.email,
      username: row.username,
      nominativo: row.nominativo,
      ruolo: normalizeRole(row.ruolo),
      attivo: Boolean(row.attivo),
      is_online: Boolean(row.is_online),
    }));

    return NextResponse.json({ success: true, users });
  } catch (error: unknown) {
    console.error('Errore GET /api/admin/users:', error);
    const message = error instanceof Error ? error.message : 'Errore caricamento utenti.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth('users:manage');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.action !== 'string') {
      return NextResponse.json({ success: false, error: 'Richiesta non valida.' }, { status: 400 });
    }

    const action = body.action;
    const admin = createAdminSupabaseClient();

    if (action === 'CREATE') {
      if (
        !isValidEmail(body.email) ||
        !isNonEmptyString(body.username, 2, 60) ||
        !isNonEmptyString(body.nominativo, 2, 120) ||
        !isValidRole(body.ruolo) ||
        typeof body.password !== 'string' ||
        body.password.length < 8
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Compila tutti i campi obbligatori. La password iniziale deve avere almeno 8 caratteri.',
          },
          { status: 400 }
        );
      }

      const email = body.email.trim().toLowerCase();
      const username = body.username.trim();
      const nominativo = body.nominativo.trim();
      const ruolo = body.ruolo;
      const attivo = typeof body.attivo === 'boolean' ? body.attivo : true;

      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
      });

      if (authError || !authData.user) {
        return NextResponse.json(
          {
            success: false,
            error: `Errore creazione credenziali: ${authError?.message || 'Utente non creato'}`,
          },
          { status: 400 }
        );
      }

      const { error: dbError } = await admin.from('utenti').insert([
        {
          id: authData.user.id,
          email,
          username,
          ruolo,
          attivo,
          nominativo,
          is_online: false,
        },
      ]);

      if (dbError) {
        await admin.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json(
          { success: false, error: `Errore scrittura DB: ${dbError.message}` },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'UPDATE') {
      if (
        !isValidId(body.id) ||
        !isValidEmail(body.email) ||
        !isNonEmptyString(body.username, 2, 60) ||
        !isNonEmptyString(body.nominativo, 2, 120) ||
        !isValidRole(body.ruolo)
      ) {
        return NextResponse.json(
          { success: false, error: 'Dati utente non validi.' },
          { status: 400 }
        );
      }

      const userId = body.id.trim();
      const email = body.email.trim().toLowerCase();
      const username = body.username.trim();
      const nominativo = body.nominativo.trim();
      const ruolo = body.ruolo;
      const attivo = typeof body.attivo === 'boolean' ? body.attivo : true;
      const password = typeof body.password === 'string' ? body.password : '';

      if (password.length > 0 && password.length < 8) {
        return NextResponse.json(
          { success: false, error: 'La nuova password deve avere almeno 8 caratteri.' },
          { status: 400 }
        );
      }

      if (userId === auth.user.id && (!attivo || ruolo !== 'admin')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Non puoi disabilitare o rimuovere i privilegi admin dal tuo stesso account.',
          },
          { status: 400 }
        );
      }

      const authUpdatePayload: {
        email: string;
        email_confirm: boolean;
        password?: string;
      } = {
        email,
        email_confirm: true,
      };
      if (password.length > 0) {
        authUpdatePayload.password = password;
      }

      const { error: authError } = await admin.auth.admin.updateUserById(userId, authUpdatePayload);
      if (authError) {
        return NextResponse.json(
          { success: false, error: `Errore aggiornamento Auth: ${authError.message}` },
          { status: 400 }
        );
      }

      const { error: dbError } = await admin
        .from('utenti')
        .update({ email, username, ruolo, attivo, nominativo })
        .eq('id', userId);

      if (dbError) {
        return NextResponse.json(
          { success: false, error: `Errore aggiornamento DB: ${dbError.message}` },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'DELETE') {
      if (!isValidId(body.id)) {
        return NextResponse.json({ success: false, error: 'ID utente non valido.' }, { status: 400 });
      }

      const userId = body.id.trim();
      if (userId === auth.user.id) {
        return NextResponse.json(
          { success: false, error: 'Non puoi eliminare il tuo account mentre sei connesso.' },
          { status: 400 }
        );
      }

      const { error: dbDeleteError } = await admin.from('utenti').delete().eq('id', userId);
      if (dbDeleteError) {
        throw new Error(`Errore eliminazione DB: ${dbDeleteError.message}`);
      }

      const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
      if (authDeleteError && !authDeleteError.message.toLowerCase().includes('not found')) {
        console.warn('Warning eliminazione utente Auth:', authDeleteError.message);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Azione non valida.' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Errore API Admin Users:', error);
    const message = error instanceof Error ? error.message : 'Errore interno gestione utenti.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
