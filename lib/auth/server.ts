import 'server-only';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { hasPermission, normalizeRole, type Permission } from '@/lib/auth/roles';
import type { UserProfile } from '@/lib/types/domain';

interface DbUserRow {
  id: string;
  email: string;
  username: string;
  nominativo: string;
  ruolo: string;
  attivo: boolean;
}

export async function getAuthenticatedUser(): Promise<UserProfile | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const admin = createAdminSupabaseClient();
  let { data: profile, error: dbError } = await admin
    .from('utenti')
    .select('id, email, username, nominativo, ruolo, attivo')
    .eq('id', user.id)
    .maybeSingle<DbUserRow>();

  // Fallback per eventuali vecchi account creati prima dell'allineamento UUID Auth <-> utenti
  if (!dbError && !profile && user.email) {
    const fallbackRes = await admin
      .from('utenti')
      .select('id, email, username, nominativo, ruolo, attivo')
      .ilike('email', user.email)
      .maybeSingle<DbUserRow>();
    profile = fallbackRes.data;
    dbError = fallbackRes.error;
  }

  if (dbError || !profile || !profile.attivo) {
    return null;
  }

  return {
    id: profile.id,
    email: profile.email,
    username: profile.username,
    nominativo: profile.nominativo,
    ruolo: normalizeRole(profile.ruolo),
    attivo: profile.attivo,
  };
}

export async function requireAuth(
  permission?: Permission
): Promise<
  | { user: UserProfile; errorResponse: null }
  | { user: null; errorResponse: NextResponse }
> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        { success: false, error: 'Non autenticato. Effettua nuovamente il login.' },
        { status: 401 }
      ),
    };
  }

  if (permission && !hasPermission(user.ruolo, permission)) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        { success: false, error: 'Permessi insufficienti per questa operazione.' },
        { status: 403 }
      ),
    };
  }

  return { user, errorResponse: null };
}

export async function requirePageAuth(permission?: Permission): Promise<UserProfile> {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect('/login?reason=session');
  }

  if (permission && !hasPermission(user.ruolo, permission)) {
    redirect('/dashboard');
  }

  return user;
}
