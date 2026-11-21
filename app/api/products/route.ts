import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

interface KbProductsRow {
  prodotto_1: string | null;
  prodotto_2: string | null;
  prodotto_3: string | null;
  prodotto_4: string | null;
  prodotto_5: string | null;
  prodotto_6: string | null;
}

interface DocProductRow {
  prodotto: string | null;
}

export async function GET() {
  const auth = await requireAuth('chat:use');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const admin = createAdminSupabaseClient();
    const [docsRes, kbRes] = await Promise.all([
      admin.from('documenti').select('prodotto'),
      admin
        .from('knowledge_base')
        .select('prodotto_1, prodotto_2, prodotto_3, prodotto_4, prodotto_5, prodotto_6'),
    ]);

    const productMap = new Map<string, string>();
    const addProduct = (raw: string | null | undefined) => {
      if (!raw) return;
      const trimmed = raw.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!productMap.has(key)) {
        productMap.set(key, trimmed);
      }
    };

    for (const row of (docsRes.data ?? []) as DocProductRow[]) {
      addProduct(row.prodotto);
    }

    for (const row of (kbRes.data ?? []) as KbProductsRow[]) {
      addProduct(row.prodotto_1);
      addProduct(row.prodotto_2);
      addProduct(row.prodotto_3);
      addProduct(row.prodotto_4);
      addProduct(row.prodotto_5);
      addProduct(row.prodotto_6);
    }

    const products = Array.from(productMap.values()).sort((a, b) => a.localeCompare(b, 'it'));

    return NextResponse.json({ success: true, products });
  } catch (error: unknown) {
    console.error('Errore GET /api/products:', error);
    return NextResponse.json(
      { success: false, products: [], error: 'Impossibile recuperare i prodotti.' },
      { status: 500 }
    );
  }
}
