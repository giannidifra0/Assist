import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getServerEnv } from '@/lib/env';
import { chunkLlamaParsePages, type LlamaParsePage } from '@/lib/pdf/chunker';
import { checkRateLimitPersistent } from '@/lib/security/rate-limit';
import { hasPdfMagicBytes, MAX_PDF_SIZE_BYTES } from '@/lib/security/validation';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const API_BASE_URL = 'https://api.cloud.llamaindex.ai/api/v1';
const MAX_POLLING_ATTEMPTS = 24;
const POLLING_DELAY_MS = 2000;

interface LlamaParseResultPayload {
  pages?: LlamaParsePage[];
}

export async function POST(req: Request) {
  const auth = await requireAuth('manuals:manage');
  if (auth.errorResponse) return auth.errorResponse;

  const rate = await checkRateLimitPersistent(`parse-pdf:${auth.user.id}`, 6, 5 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: `Troppi file elaborati in poco tempo. Riprova tra ${rate.retryAfterSec} secondi.`,
      },
      { status: 429 }
    );
  }

  try {
    const formData = await req.formData();
    const fileEntry = formData.get('file');

    if (!fileEntry || !(fileEntry instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'Nessun file PDF fornito o formato non valido.' },
        { status: 400 }
      );
    }

    if (fileEntry.size === 0 || fileEntry.size > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Il file PDF deve essere inferiore a 25 MB.' },
        { status: 400 }
      );
    }

    if (!fileEntry.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { success: false, error: 'Sono accettati esclusivamente file con estensione .pdf.' },
        { status: 400 }
      );
    }

    const fileBuffer = await fileEntry.arrayBuffer();
    if (!hasPdfMagicBytes(fileBuffer)) {
      return NextResponse.json(
        { success: false, error: 'Il file caricato non è un PDF valido.' },
        { status: 400 }
      );
    }

    const { llamaparseApiKey } = getServerEnv();

    const uploadFormData = new FormData();
    uploadFormData.append(
      'file',
      new Blob([fileBuffer], { type: 'application/pdf' }),
      fileEntry.name
    );
    uploadFormData.append('result_type', 'markdown');
    uploadFormData.append(
      'parsing_instruction',
      'Extract as pure Markdown. Preserve tables strictly as markdown tables. Use # for main chapters (H1) and ## for sub-chapters (H2). CRITICAL INSTRUCTION: The document contains font rendering issues, custom ligatures, and bad text encoding (especially on italicized or highlighted text). You MUST actively reconstruct broken words, remove abnormal intra-word spacing, and fix garbled characters to output perfectly spelled Italian text.'
    );

    const uploadRes = await fetch(`${API_BASE_URL}/parsing/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${llamaparseApiKey}`,
        Accept: 'application/json',
      },
      body: uploadFormData,
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      throw new Error(`Errore caricamento LlamaParse: ${uploadRes.status} - ${errorText}`);
    }

    const uploadJson = (await uploadRes.json()) as { id?: string };
    const jobId = uploadJson.id;
    if (!jobId) {
      throw new Error('ID job LlamaParse mancante nella risposta.');
    }

    let status = 'PENDING';
    let attempts = 0;

    while ((status === 'PENDING' || status === 'RUNNING') && attempts < MAX_POLLING_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLLING_DELAY_MS));

      const statusRes = await fetch(`${API_BASE_URL}/parsing/job/${jobId}`, {
        headers: {
          Authorization: `Bearer ${llamaparseApiKey}`,
          Accept: 'application/json',
        },
      });

      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as { status?: string };
        status = statusData.status ?? status;
      }
      attempts++;
    }

    if (status !== 'SUCCESS') {
      throw new Error(`Elaborazione fallita o andata in timeout. Stato finale: ${status}`);
    }

    const resultRes = await fetch(`${API_BASE_URL}/parsing/job/${jobId}/result/json`, {
      headers: {
        Authorization: `Bearer ${llamaparseApiKey}`,
        Accept: 'application/json',
      },
    });

    if (!resultRes.ok) {
      throw new Error('Impossibile recuperare i dati processati dal job LlamaParse.');
    }

    const resultData = (await resultRes.json()) as
      | LlamaParseResultPayload
      | LlamaParseResultPayload[];
    const pages: LlamaParsePage[] = Array.isArray(resultData)
      ? resultData[0]?.pages ?? []
      : resultData.pages ?? [];

    const outputChunks = chunkLlamaParsePages(pages);

    return NextResponse.json({
      success: true,
      chunks: outputChunks,
      message: outputChunks.length === 0 ? 'Documento vuoto o non processabile.' : undefined,
    });
  } catch (error: unknown) {
    console.error('Errore nel backend API parse-pdf:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Errore sconosciuto durante il parsing';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
