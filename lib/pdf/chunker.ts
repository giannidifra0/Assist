import 'server-only';
import type { ParsedChunk } from '@/lib/types/domain';

const MAX_SEZIONE_ESTREMA = 3500;
const MIN_CHUNK_LENGTH = 20;

export interface LlamaParsePage {
  page?: number;
  text?: string;
}

export function chunkLlamaParsePages(pages: LlamaParsePage[]): ParsedChunk[] {
  if (pages.length === 0) return [];

  const pagesLines = pages.map((p) => (p.text || '').split('\n').map((l) => l.trim()));
  const lineFrequencies = new Map<string, number>();

  pagesLines.forEach((lines) => {
    const uniqueLinesInPage = new Set(lines);
    uniqueLinesInPage.forEach((line) => {
      const textOnly = line.replace(/<\/?[^>]+(>|$)/g, '').trim();
      if (textOnly.length > 0 && textOnly.length < 80) {
        lineFrequencies.set(textOnly, (lineFrequencies.get(textOnly) || 0) + 1);
      }
    });
  });

  const totalPages = pagesLines.length;
  const repeatingLines = new Set<string>();
  lineFrequencies.forEach((count, line) => {
    if (totalPages > 3 && count >= Math.ceil(totalPages * 0.4)) {
      repeatingLines.add(line);
    }
  });

  const outputChunks: ParsedChunk[] = [];
  let currentH1 = 'Introduzione';
  let currentH2 = '';
  let currentH3 = '';
  let testoAccumulato = '';
  let paginaInizioBlocco = 1;

  const unwrapperSemantico = (rawText: string): string => {
    let text = rawText.normalize('NFKC');
    text = text.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '');
    text = text.replace(/<\/?[^>]+(>|$)/g, '');

    const lines = text.split('\n');
    const unwrapped: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        unwrapped.push('');
        continue;
      }

      if (unwrapped.length === 0 || unwrapped[unwrapped.length - 1] === '') {
        unwrapped.push(line);
        continue;
      }

      const prevLine = unwrapped[unwrapped.length - 1];
      const isPreservedFormat =
        /^(\||[a-zA-Z0-9]{1,3}\.|-|\*|•|>)\s/.test(line) || line.startsWith('|');

      if (isPreservedFormat) {
        unwrapped.push(line);
      } else if (prevLine.endsWith('-')) {
        unwrapped[unwrapped.length - 1] = prevLine.slice(0, -1) + line;
      } else {
        unwrapped[unwrapped.length - 1] = `${prevLine} ${line}`;
      }
    }

    return unwrapped
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .trim();
  };

  const salvaChunkSemantico = (
    h1: string,
    h2: string,
    h3: string,
    pagina: number,
    testo: string
  ) => {
    const testoFinale = unwrapperSemantico(testo);
    if (testoFinale.length < MIN_CHUNK_LENGTH) return;

    let capitoloFinale = h1;
    if (h2) capitoloFinale += ` - ${h2}`;
    if (h3) capitoloFinale += ` - ${h3}`;

    if (testoFinale.length <= MAX_SEZIONE_ESTREMA) {
      outputChunks.push({ capitolo: capitoloFinale, pagina, testo: testoFinale });
      return;
    }

    const paragrafi = testoFinale.split('\n\n');
    let chunkCorrente = '';
    let parte = 1;
    let ultimoParagrafo = '';

    for (let i = 0; i < paragrafi.length; i++) {
      const paragrafo = paragrafi[i].trim();
      if (!paragrafo) continue;

      if (
        chunkCorrente.length + paragrafo.length > MAX_SEZIONE_ESTREMA &&
        chunkCorrente.length > 0
      ) {
        outputChunks.push({
          capitolo: `${capitoloFinale} (P. ${parte})`,
          pagina,
          testo: chunkCorrente.trim(),
        });
        parte++;

        if (ultimoParagrafo && ultimoParagrafo.length < 800) {
          chunkCorrente = `${ultimoParagrafo}\n\n${paragrafo}`;
        } else {
          chunkCorrente = paragrafo;
        }
      } else {
        chunkCorrente += (chunkCorrente ? '\n\n' : '') + paragrafo;
      }

      ultimoParagrafo = paragrafo;

      if (chunkCorrente.length > MAX_SEZIONE_ESTREMA) {
        let splitIndex = chunkCorrente.lastIndexOf('. ', MAX_SEZIONE_ESTREMA);
        if (splitIndex === -1) splitIndex = MAX_SEZIONE_ESTREMA;

        outputChunks.push({
          capitolo: `${capitoloFinale} (P. ${parte})`,
          pagina,
          testo: chunkCorrente.substring(0, splitIndex + 1).trim(),
        });
        chunkCorrente = chunkCorrente.substring(splitIndex + 1).trim();
        parte++;
      }
    }

    if (chunkCorrente.trim().length > 0) {
      outputChunks.push({
        capitolo: `${capitoloFinale} (P. ${parte})`,
        pagina,
        testo: chunkCorrente.trim(),
      });
    }
  };

  for (let i = 0; i < pages.length; i++) {
    const pageNum = pages[i].page || i + 1;
    const lines = pagesLines[i];

    let tocScore = 0;
    for (const line of lines) {
      if (line.match(/\|\s*\d+$/) || line.match(/\.{4,}/) || line.match(/\.\s*\d+$/)) {
        tocScore++;
      }
    }
    if (tocScore >= 4) continue;

    for (const line of lines) {
      const cleanLine = line.replace(/<\/?[^>]+(>|$)/g, '').trim();
      if (cleanLine.length === 0) continue;
      if (repeatingLines.has(cleanLine) || cleanLine.match(/^Pag(ina|\.)?\s*\d+\s*\/\s*\d+$/i)) {
        continue;
      }

      const isMarkdownHeading = cleanLine.match(/^#{1,6}\s/);
      const isZucchettiH1 = cleanLine.match(/^(?:◆|■)\s/);
      const isZucchettiH2 = cleanLine.match(/^(?:>|►|›)\s/);
      const isZucchettiH3 = cleanLine.match(/^(?:•)\s/);

      const isAllCaps =
        cleanLine === cleanLine.toUpperCase() &&
        Boolean(cleanLine.match(/[A-Z]/)) &&
        cleanLine.length > 5 &&
        cleanLine.length < 60 &&
        !cleanLine.includes('_') &&
        !cleanLine.match(/^(ATTENZIONE|NOTA|N\.B\.|NB:)/);

      if (isMarkdownHeading || isZucchettiH1 || isZucchettiH2 || isZucchettiH3 || isAllCaps) {
        if (testoAccumulato.trim().length > 0) {
          salvaChunkSemantico(currentH1, currentH2, currentH3, paginaInizioBlocco, testoAccumulato);
        }

        let titleRaw = cleanLine.replace(/^[^a-zA-ZÀ-ÿ0-9]+/, '').trim();
        if (!titleRaw) titleRaw = 'Sezione';

        const isAllUpperTitle =
          titleRaw === titleRaw.toUpperCase() && /[A-ZÀ-Ý]/.test(titleRaw);
        const titleClean = isAllUpperTitle
          ? titleRaw.charAt(0).toUpperCase() + titleRaw.slice(1).toLowerCase()
          : titleRaw;

        if (isMarkdownHeading) {
          if (cleanLine.startsWith('# ')) {
            currentH1 = titleClean;
            currentH2 = '';
            currentH3 = '';
          } else if (cleanLine.startsWith('## ')) {
            currentH2 = titleClean;
            currentH3 = '';
          } else {
            currentH3 = titleClean;
          }
        } else if (isZucchettiH1 || isAllCaps) {
          currentH1 = titleClean;
          currentH2 = '';
          currentH3 = '';
        } else if (isZucchettiH2) {
          currentH2 = titleClean;
          currentH3 = '';
        } else if (isZucchettiH3) {
          currentH3 = titleClean;
        }

        testoAccumulato = '';
        paginaInizioBlocco = pageNum;
      } else {
        testoAccumulato += `${cleanLine}\n`;
      }
    }
  }

  if (testoAccumulato.trim().length > 0) {
    salvaChunkSemantico(currentH1, currentH2, currentH3, paginaInizioBlocco, testoAccumulato);
  }

  return outputChunks;
}
