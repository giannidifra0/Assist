import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getServerEnv } from '@/lib/env';
import { chunkLlamaParsePages, type LlamaParsePage } from '@/lib/pdf/chunker';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const API_BASE_URL = 'https://api.cloud.llamaindex.ai/api/v1';
const JOB_ID_REGEX = /^[a-zA-Z0-9_-]{8,128}$/;

interface LlamaParseResultPayload {
  pages?: LlamaParsePage[];
}

export async function GET(req: Request) {
  const auth = await requireAuth('manuals:manage');
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId')?.trim() ?? '';

    if (!JOB_ID_REGEX.test(jobId)) {
      return NextResponse.json(
        { success: false, error: 'Identificativo job non valido.' },
        { status: 400 }
      );
    }

    const { llamaparseApiKey } = getServerEnv();

    const statusRes = await fetch(`${API_BASE_URL}/parsing/job/${encodeURIComponent(jobId)}`, {
      headers: {
        Authorization: `Bearer ${llamaparseApiKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!statusRes.ok) {
      throw new Error(`Impossibile verificare lo stato del job (${statusRes.status}).`);
    }

    const statusData = (await statusRes.json()) as { status?: string; error_message?: string };
    const status = (statusData.status ?? 'PENDING').toUpperCase();

    if (status === 'PENDING' || status === 'RUNNING') {
      return NextResponse.json({ success: true, status });
    }

    if (status !== 'SUCCESS') {
      return NextResponse.json(
        {
          success: false,
          status,
          error:
            statusData.error_message ||
            `Elaborazione PDF terminata con stato imprevisto: ${status}`,
        },
        { status: 422 }
      );
    }

    const resultRes = await fetch(
      `${API_BASE_URL}/parsing/job/${encodeURIComponent(jobId)}/result/json`,
      {
        headers: {
          Authorization: `Bearer ${llamaparseApiKey}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (!resultRes.ok) {
      throw new Error('Impossibile recuperare i dati processati dal job LlamaParse.');
    }

    const resultData = (await resultRes.json()) as
      | LlamaParseResultPayload
      | LlamaParseResultPayload[];
    const pages: LlamaParsePage[] = Array.isArray(resultData)
      ? resultData[0]?.pages ?? []
      : resultData.pages ?? [];

    const chunks = chunkLlamaParsePages(pages);

    return NextResponse.json({
      success: true,
      status: 'SUCCESS',
      chunks,
      message:
        chunks.length === 0 ? 'Documento vuoto o privo di testo estraibile.' : undefined,
    });
  } catch (error: unknown) {
    console.error('Errore /api/parse-pdf/status:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Errore verifica stato parsing PDF.';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
