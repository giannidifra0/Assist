import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function getSafeRedirectPath(rawNext: string | null): string {
  if (!rawNext) return '/dashboard';
  if (
    (rawNext.startsWith('/dashboard') || rawNext.startsWith('/auth/reset-password')) &&
    !rawNext.startsWith('//')
  ) {
    return rawNext;
  }
  return '/dashboard';
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const nextPath = getSafeRedirectPath(searchParams.get('next'));

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(nextPath, origin));
    }
  }

  return NextResponse.redirect(new URL('/login?reason=session', origin));
}
