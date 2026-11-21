import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimitPersistent, getClientIp } from '@/lib/security/rate-limit';
import { isValidEmail } from '@/lib/security/validation';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const ipRate = await checkRateLimitPersistent(`reset:ip:${ip}`, 5, 15 * 60_000);
    if (!ipRate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Troppe richieste ravvicinate. Riprova tra ${ipRate.retryAfterSec} secondi.`,
        },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    if (!body || !isValidEmail(body.email)) {
      return NextResponse.json(
        { success: false, error: 'Inserisci un indirizzo email valido.' },
        { status: 400 }
      );
    }

    const email = body.email.trim().toLowerCase();
    const emailRate = await checkRateLimitPersistent(`reset:email:${email}`, 5, 15 * 60_000);
    if (!emailRate.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Troppe richieste per questa email. Riprova tra ${emailRate.retryAfterSec} secondi.`,
        },
        { status: 429 }
      );
    }

    const origin = new URL(req.url).origin;
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
    });

    if (error) {
      console.warn('Warning resetPasswordForEmail:', error.message);
    }

    // Risposta sempre generica per evitare enumerazione degli account
    return NextResponse.json({
      success: true,
      message:
        "Se l'indirizzo email è associato a un account attivo, riceverai a breve le istruzioni per reimpostare la password.",
    });
  } catch (error: unknown) {
    console.error('Errore API reset-password:', error);
    return NextResponse.json(
      { success: false, error: 'Impossibile processare la richiesta di ripristino.' },
      { status: 500 }
    );
  }
}
