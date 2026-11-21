import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth/server';

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (user) {
      const admin = createAdminSupabaseClient();
      await admin.from('utenti').update({ is_online: false }).eq('id', user.id);
    }

    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Errore API logout:', error);
    return NextResponse.json({ success: false, error: 'Errore durante la disconnessione.' }, { status: 500 });
  }
}
