import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return new NextResponse(null, { status: 204 });
    }

    let online = true;
    const rawText = await req.text().catch(() => '');
    if (rawText) {
      try {
        const parsed = JSON.parse(rawText) as { online?: unknown };
        if (typeof parsed.online === 'boolean') {
          online = parsed.online;
        }
      } catch {
        // Ignora body malformati inviati da sendBeacon
      }
    }

    const admin = createAdminSupabaseClient();
    await admin.from('utenti').update({ is_online: online }).eq('id', user.id);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Errore API presence:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
