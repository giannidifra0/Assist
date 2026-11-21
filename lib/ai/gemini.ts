import 'server-only';
import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type EmbedContentConfig,
  type GenerateContentConfig,
  type GenerateContentResponseUsageMetadata,
  type ThinkingConfig,
} from '@google/genai';
import { getServerEnv } from '@/lib/env';
import type { ChatModelMode } from '@/lib/types/domain';

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (geminiClient) return geminiClient;
  const { geminiApiKey } = getServerEnv();
  geminiClient = new GoogleGenAI({ apiKey: geminiApiKey });
  return geminiClient;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function isNonRetryableAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('api key') ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthenticated')
  );
}

function isRetryableEmbeddingError(message: string): boolean {
  if (isNonRetryableAuthError(message)) return false;
  const lower = message.toLowerCase();
  if (lower.includes('invalid_argument') || lower.includes('invalid argument')) {
    return false;
  }
  return (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate') ||
    lower.includes('500') ||
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('deadline') ||
    lower.includes('timeout') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset')
  );
}

export function buildThinkingConfig(
  modelName: string,
  level: ThinkingLevel
): ThinkingConfig | undefined {
  if (modelName.startsWith('gemini-3') || modelName.startsWith('gemini-4')) {
    return { thinkingLevel: level };
  }
  if (modelName.startsWith('gemini-2.5')) {
    return { thinkingBudget: 0 };
  }
  return undefined;
}

export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export interface EmbedTextOptions {
  taskType?: EmbeddingTaskType;
  title?: string;
}

export interface EmbedTextsBatchOptions {
  taskType?: EmbeddingTaskType;
  maxSubBatchSize?: number;
  maxCharsPerRequest?: number;
  deadlineMs?: number;
}

export async function embedText(
  text: string,
  options?: EmbedTextOptions
): Promise<number[]> {
  const ai = getGeminiClient();
  const { geminiEmbeddingModel } = getServerEnv();

  const config: EmbedContentConfig | undefined = (() => {
    if (!options?.taskType && !options?.title) return undefined;
    const cfg: EmbedContentConfig = {};
    if (options.taskType) {
      cfg.taskType = options.taskType;
    }
    const cleanTitle = options.title?.trim();
    if (options.taskType === 'RETRIEVAL_DOCUMENT' && cleanTitle) {
      cfg.title = cleanTitle.slice(0, 200);
    }
    return Object.keys(cfg).length > 0 ? cfg : undefined;
  })();

  const backoffMs = [1200, 2800];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await ai.models.embedContent({
        model: geminiEmbeddingModel,
        contents: text,
        ...(config ? { config } : {}),
      });

      const vector = result.embeddings?.[0]?.values;
      if (vector && vector.length > 0) {
        return vector;
      }
      throw new Error('Risposta embedding priva di vettori.');
    } catch (error: unknown) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      if (isNonRetryableAuthError(msg) || !isRetryableEmbeddingError(msg) || attempt === 2) {
        throw error;
      }
      await delay(backoffMs[attempt] ?? 2000);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Impossibile contattare il servizio di Embedding IA.");
}

async function runSingleBatchEmbedRequest(
  ai: GoogleGenAI,
  model: string,
  texts: string[],
  taskType: EmbeddingTaskType | undefined,
  deadlineMs: number | undefined
): Promise<number[][]> {
  const backoffMs = [1500, 3500, 7000];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      throw new Error('BATCH_DEADLINE_EXCEEDED');
    }

    try {
      const result = await ai.models.embedContent({
        model,
        contents: texts,
        ...(taskType ? { config: { taskType } } : {}),
      });

      const embeddings = result.embeddings ?? [];
      if (embeddings.length !== texts.length) {
        throw new Error(
          `Batch embedding incompleto: attesi ${texts.length} vettori, ricevuti ${embeddings.length}.`
        );
      }

      const vectors: number[][] = [];
      for (let i = 0; i < embeddings.length; i++) {
        const values = embeddings[i]?.values;
        if (!values || values.length === 0) {
          throw new Error(`Vettore mancante alla posizione ${i} del batch.`);
        }
        vectors.push(values);
      }
      return vectors;
    } catch (error: unknown) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      if (isNonRetryableAuthError(msg) || !isRetryableEmbeddingError(msg) || attempt === 2) {
        throw error;
      }
      const waitMs = backoffMs[attempt] ?? 2000;
      if (deadlineMs !== undefined && Date.now() + waitMs >= deadlineMs) {
        throw new Error('BATCH_DEADLINE_EXCEEDED');
      }
      await delay(waitMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Batch embedding fallito dopo i tentativi consentiti.');
}

async function embedSubBatchWithIsolation(
  ai: GoogleGenAI,
  model: string,
  items: Array<{ index: number; text: string }>,
  output: Array<number[] | null>,
  taskType: EmbeddingTaskType | undefined,
  deadlineMs: number | undefined
): Promise<void> {
  if (items.length === 0) return;
  if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
    return;
  }

  try {
    const vectors = await runSingleBatchEmbedRequest(
      ai,
      model,
      items.map((it) => it.text),
      taskType,
      deadlineMs
    );
    for (let i = 0; i < items.length; i++) {
      output[items[i].index] = vectors[i];
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (isNonRetryableAuthError(msg)) {
      throw error;
    }
    if (msg === 'BATCH_DEADLINE_EXCEEDED' || (deadlineMs !== undefined && Date.now() >= deadlineMs)) {
      return;
    }

    if (items.length > 1) {
      const mid = Math.ceil(items.length / 2);
      await embedSubBatchWithIsolation(
        ai,
        model,
        items.slice(0, mid),
        output,
        taskType,
        deadlineMs
      );
      await embedSubBatchWithIsolation(
        ai,
        model,
        items.slice(mid),
        output,
        taskType,
        deadlineMs
      );
      return;
    }

    console.warn(`[Gemini Batch Embed] Elemento #${items[0].index} fallito:`, msg);
    output[items[0].index] = null;
  }
}

export async function embedTextsBatch(
  texts: string[],
  options?: EmbedTextsBatchOptions
): Promise<Array<number[] | null>> {
  if (texts.length === 0) return [];

  const ai = getGeminiClient();
  const { geminiEmbeddingModel } = getServerEnv();
  const maxSubBatchSize = Math.min(50, Math.max(1, options?.maxSubBatchSize ?? 25));
  const maxCharsPerRequest = Math.max(4000, options?.maxCharsPerRequest ?? 40_000);
  const deadlineMs = options?.deadlineMs;

  const output: Array<number[] | null> = new Array(texts.length).fill(null);

  // Partiziona in sotto-batch rispettando sia il limite di elementi sia il tetto di caratteri
  const subBatches: Array<Array<{ index: number; text: string }>> = [];
  let current: Array<{ index: number; text: string }> = [];
  let currentChars = 0;

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const nextChars = currentChars + text.length;
    if (
      current.length > 0 &&
      (current.length >= maxSubBatchSize || nextChars > maxCharsPerRequest)
    ) {
      subBatches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push({ index: i, text });
    currentChars += text.length;
  }
  if (current.length > 0) {
    subBatches.push(current);
  }

  for (const subBatch of subBatches) {
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      break;
    }
    await embedSubBatchWithIsolation(
      ai,
      geminiEmbeddingModel,
      subBatch,
      output,
      options?.taskType,
      deadlineMs
    );
  }

  return output;
}

interface ModelAttemptConfig {
  model: string;
  maxOutputTokens: number;
  temperature: number;
  thinkingLevel: ThinkingLevel;
  timeoutMs: number;
}

function getAttemptSequence(mode: ChatModelMode): ModelAttemptConfig[] {
  const env = getServerEnv();

  const primary: ModelAttemptConfig =
    mode === 'advanced'
      ? {
          model: env.geminiModelAdvanced,
          maxOutputTokens: 2560,
          temperature: 0.15,
          thinkingLevel: ThinkingLevel.LOW,
          timeoutMs: 32_000,
        }
      : {
          model: env.geminiModelEco,
          maxOutputTokens: 1536,
          temperature: 0.15,
          thinkingLevel: ThinkingLevel.MINIMAL,
          timeoutMs: 25_000,
        };

  const fallback: ModelAttemptConfig = {
    model: env.geminiModelFallback,
    maxOutputTokens: 1536,
    temperature: 0.15,
    thinkingLevel: ThinkingLevel.MINIMAL,
    timeoutMs: 22_000,
  };

  if (primary.model === fallback.model) {
    return [primary];
  }
  return [primary, fallback];
}

export interface ChatGenerationParams {
  mode: ChatModelMode;
  systemInstruction: string;
  history: Content[];
  prompt: string;
}

export interface ChatGenerationResult {
  text: string;
  modelUsed: string;
  fallbackUsed: boolean;
  usageMetadata: GenerateContentResponseUsageMetadata | undefined;
}

export async function generateChatWithFallback(
  params: ChatGenerationParams
): Promise<ChatGenerationResult> {
  const ai = getGeminiClient();
  const attempts = getAttemptSequence(params.mode);

  let lastError: unknown = null;

  for (let idx = 0; idx < attempts.length; idx++) {
    const cfg = attempts[idx];
    const isFallback = idx > 0;

    const thinkingConfig = buildThinkingConfig(cfg.model, cfg.thinkingLevel);
    const generationConfig: GenerateContentConfig = {
      systemInstruction: params.systemInstruction,
      temperature: cfg.temperature,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: cfg.maxOutputTokens,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    };

    const maxTriesForModel = isFallback ? 1 : 2;

    for (let tryCount = 0; tryCount < maxTriesForModel; tryCount++) {
      try {
        const chat = ai.chats.create({
          model: cfg.model,
          config: generationConfig,
          history: params.history,
        });

        const chatPromise = chat.sendMessage({ message: params.prompt });
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('TIMEOUT_SUPERATO')), cfg.timeoutMs);
        });

        const result = await Promise.race([chatPromise, timeoutPromise]);
        const text = result.text?.trim() ?? '';

        if (!text) {
          throw new Error(`Risposta vuota dal modello ${cfg.model}.`);
        }

        return {
          text,
          modelUsed: cfg.model,
          fallbackUsed: isFallback,
          usageMetadata: result.usageMetadata,
        };
      } catch (error: unknown) {
        lastError = error;
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[Gemini] Modello ${cfg.model} tentativo ${tryCount + 1}/${maxTriesForModel} fallito:`,
          msg
        );

        if (isNonRetryableAuthError(msg)) {
          throw error;
        }

        if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('400')) {
          break;
        }

        if (tryCount < maxTriesForModel - 1) {
          await delay(1200);
        }
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Impossibile generare una risposta dai modelli Gemini.");
}

export interface StreamChatParams extends ChatGenerationParams {
  onDelta: (delta: string) => void;
}

/**
 * Calcola quanta parte del buffer non emesso è sicura da inviare al client durante lo streaming,
 * trattenendo un eventuale prefisso di tag macchina `[[FONTI_USATE:...]]` a fine risposta.
 */
function computeSafeStreamFlushLength(pending: string): number {
  const doubleBracketIdx = pending.indexOf('[[');
  if (doubleBracketIdx !== -1) {
    return doubleBracketIdx;
  }
  if (pending.endsWith('[')) {
    return pending.length - 1;
  }
  return pending.length;
}

export async function streamChatWithFallback(
  params: StreamChatParams
): Promise<ChatGenerationResult> {
  const ai = getGeminiClient();
  const attempts = getAttemptSequence(params.mode);

  let lastError: unknown = null;

  for (let idx = 0; idx < attempts.length; idx++) {
    const cfg = attempts[idx];
    const isFallback = idx > 0;

    const thinkingConfig = buildThinkingConfig(cfg.model, cfg.thinkingLevel);
    const generationConfig: GenerateContentConfig = {
      systemInstruction: params.systemInstruction,
      temperature: cfg.temperature,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: cfg.maxOutputTokens,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    };

    const maxTriesForModel = isFallback ? 1 : 2;

    for (let tryCount = 0; tryCount < maxTriesForModel; tryCount++) {
      let emittedLength = 0;
      let fullText = '';
      let pendingBuffer = '';
      let usageMetadata: GenerateContentResponseUsageMetadata | undefined;

      try {
        const chat = ai.chats.create({
          model: cfg.model,
          config: generationConfig,
          history: params.history,
        });

        const streamPromise = chat.sendMessageStream({ message: params.prompt });
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('TIMEOUT_SUPERATO')), cfg.timeoutMs);
        });

        const stream = await Promise.race([streamPromise, timeoutPromise]);

        for await (const chunk of stream) {
          if (chunk.usageMetadata) {
            usageMetadata = chunk.usageMetadata;
          }
          const delta = chunk.text ?? '';
          if (!delta) continue;

          fullText += delta;
          pendingBuffer += delta;

          // Una volta incontrato '[[', tratteniamo il finale per non mostrare il tag macchina
          if (!pendingBuffer.includes('[[')) {
            const safeLen = computeSafeStreamFlushLength(pendingBuffer);
            if (safeLen > 0) {
              const toEmit = pendingBuffer.slice(0, safeLen);
              pendingBuffer = pendingBuffer.slice(safeLen);
              emittedLength += toEmit.length;
              params.onDelta(toEmit);
            }
          }
        }

        // Se ciò che è rimasto nel buffer non è un tag [[FONTI_USATE...]], emettilo ora
        if (pendingBuffer && !pendingBuffer.includes('[[FONTI_USATE')) {
          const cleanTail = pendingBuffer.replace(/\[\[FONTI_USATE:[^\]]*\]\]/gi, '');
          if (cleanTail) {
            emittedLength += cleanTail.length;
            params.onDelta(cleanTail);
          }
        }

        const trimmed = fullText.trim();
        if (!trimmed) {
          throw new Error(`Risposta vuota dal modello ${cfg.model}.`);
        }

        return {
          text: trimmed,
          modelUsed: cfg.model,
          fallbackUsed: isFallback,
          usageMetadata,
        };
      } catch (error: unknown) {
        lastError = error;
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[Gemini Stream] Modello ${cfg.model} tentativo ${tryCount + 1}/${maxTriesForModel} fallito:`,
          msg
        );

        // Se abbiamo già inviato testo al client non possiamo ricominciare lo stream su un altro modello
        if (emittedLength > 0 || isNonRetryableAuthError(msg)) {
          throw error;
        }

        if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('400')) {
          break;
        }

        if (tryCount < maxTriesForModel - 1) {
          await delay(1200);
        }
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Impossibile generare una risposta in streaming dai modelli Gemini.");
}
