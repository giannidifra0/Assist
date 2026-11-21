import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { DashboardStats } from '@/lib/types/domain';

export async function GET() {
  const auth = await requireAuth();
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const admin = createAdminSupabaseClient();

    const [kbRes, pendingKbRes, pendingManualRes, onlineRes, manualsRes, ticketsRes] =
      await Promise.all([
        admin.from('knowledge_base').select('*', { count: 'exact', head: true }),
        admin.from('knowledge_base').select('*', { count: 'exact', head: true }).is('embedding', null),
        admin.from('documenti_chunk').select('*', { count: 'exact', head: true }).is('embedding', null),
        admin.from('utenti').select('*', { count: 'exact', head: true }).eq('is_online', true),
        admin.from('documenti').select('*', { count: 'exact', head: true }),
        admin.from('tickets').select('*', { count: 'exact', head: true }),
      ]);

    const pendingKbEmbeddings = pendingKbRes.count ?? 0;
    const pendingManualChunks = pendingManualRes.error ? 0 : (pendingManualRes.count ?? 0);

    const stats: DashboardStats = {
      knowledge: kbRes.count ?? 0,
      pendingKbEmbeddings,
      pendingManualChunks,
      pendingEmbeddings: pendingKbEmbeddings + pendingManualChunks,
      usersOnline: onlineRes.count ?? 0,
      manuals: manualsRes.count ?? 0,
      tickets: ticketsRes.error ? 0 : (ticketsRes.count ?? 0),
    };

    return NextResponse.json({ success: true, stats });
  } catch (error: unknown) {
    console.error('Errore API dashboard stats:', error);
    return NextResponse.json(
      { success: false, error: 'Impossibile recuperare le statistiche.' },
      { status: 500 }
    );
  }
}
