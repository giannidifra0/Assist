import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: "Nessun file fornito" }, { status: 400 });
    }

    const apiKey = process.env.LLAMAPARSE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Chiave API LlamaParse mancante" }, { status: 500 });
    }

    const uploadFormData = new FormData();
    uploadFormData.append('file', file);
    uploadFormData.append('result_type', 'markdown'); 
    // SOLUZIONE SISTEMICA 1: Istruiamo l'IA del parser a riparare attivamente il kerning e l'encoding del font su tutto il documento.
    uploadFormData.append('parsing_instruction', 'Extract as pure Markdown. Preserve tables strictly as markdown tables. Use # for main chapters (H1) and ## for sub-chapters (H2). CRITICAL INSTRUCTION: The document contains font rendering issues, custom ligatures, and bad text encoding (especially on italicized or highlighted text). You MUST actively reconstruct broken words, remove abnormal intra-word spacing, and fix garbled characters to output perfectly spelled Italian text.');

    const uploadRes = await fetch('https://api.cloud.llamaindex.ai/api/v1/parsing/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
      body: uploadFormData
    });

    if (!uploadRes.ok) throw new Error("Errore di caricamento su LlamaParse");
    const jobId = (await uploadRes.json()).id;

    let status = 'PENDING';
    let attempts = 0;
    while ((status === 'PENDING' || status === 'RUNNING') && attempts < 40) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const statusRes = await fetch(`https://api.cloud.llamaindex.ai/api/v1/parsing/job/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
      });
      if (statusRes.ok) status = (await statusRes.json()).status;
      attempts++;
    }

    if (status !== 'SUCCESS') throw new Error("Elaborazione LlamaParse fallita.");

    const resultRes = await fetch(`https://api.cloud.llamaindex.ai/api/v1/parsing/job/${jobId}/result/json`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
    });
    
    if (!resultRes.ok) throw new Error("Impossibile recuperare i dati");
    const resultData = await resultRes.json();
    const pages = Array.isArray(resultData) ? (resultData[0]?.pages || []) : (resultData.pages || []);

    const pagesLines = pages.map((p: any) => (p.text || '').split('\n').map((l: string) => l.trim()));
    const lineFrequencies = new Map<string, number>();

    pagesLines.forEach((lines: string[]) => {
      const uniqueLinesInPage = new Set(lines);
      uniqueLinesInPage.forEach(line => {
        let textOnly = line.replace(/<\/?[^>]+(>|$)/g, "").trim();
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

    const outputChunks: any[] = [];
    let currentH1 = "Introduzione";
    let currentH2 = "";
    let testoAccumulato = "";
    let paginaInizioBlocco = 1;

    const unwrapperSemantico = (rawText: string) => {
      // SOLUZIONE SISTEMICA 2: Normalizzazione Unicode Globale
      // 1. NFKC fonde i caratteri complessi (es. legature tipografiche) nei loro equivalenti standard.
      let text = rawText.normalize('NFKC');
      // 2. Elimina i "Zero-Width Spaces" e i caratteri di controllo invisibili che i PDF piazzano in mezzo alle lettere.
      text = text.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, "");
      // 3. Elimina HTML residuo
      text = text.replace(/<\/?[^>]+(>|$)/g, ""); 

      let lines = text.split('\n');
      let unwrapped: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) {
          unwrapped.push(""); 
          continue;
        }

        if (unwrapped.length === 0 || unwrapped[unwrapped.length - 1] === "") {
          unwrapped.push(line);
          continue;
        }

        let prevLine = unwrapped[unwrapped.length - 1];
        const isPreservedFormat = /^(\||[a-zA-Z0-9]{1,3}\.|-|\*|•|>)\s/.test(line) || line.startsWith('|');

        if (isPreservedFormat) {
          unwrapped.push(line); 
        } else {
          if (prevLine.endsWith('-')) {
            unwrapped[unwrapped.length - 1] = prevLine.slice(0, -1) + line;
          } else {
            unwrapped[unwrapped.length - 1] = prevLine + " " + line;
          }
        }
      }
      return unwrapped.join('\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();
    };

    const salvaChunkSemantico = (h1: string, h2: string, pagina: number, testo: string) => {
      let testoFinale = unwrapperSemantico(testo);
      if (testoFinale.length < 20) return;

      let capitoloFinale = h2 ? `${h1} - ${h2}` : h1;
      const MAX_SEZIONE_ESTREMA = 3500; 

      if (testoFinale.length <= MAX_SEZIONE_ESTREMA) {
        outputChunks.push({ capitolo: capitoloFinale, pagina, testo: testoFinale });
      } else {
        let rimanente = testoFinale;
        let parte = 1;
        while (rimanente.length > 0) {
          if (rimanente.length <= MAX_SEZIONE_ESTREMA) {
            outputChunks.push({ capitolo: `${capitoloFinale} (P. ${parte})`, pagina, testo: rimanente });
            break;
          }

          let splitIndex = rimanente.lastIndexOf('\n\n', MAX_SEZIONE_ESTREMA);
          if (splitIndex === -1) splitIndex = rimanente.lastIndexOf('. ', MAX_SEZIONE_ESTREMA);
          if (splitIndex === -1) splitIndex = MAX_SEZIONE_ESTREMA;

          outputChunks.push({ capitolo: `${capitoloFinale} (P. ${parte})`, pagina, testo: rimanente.substring(0, splitIndex + 1).trim() });
          rimanente = rimanente.substring(splitIndex + 1).trim();
          parte++;
        }
      }
    };

    for (let i = 0; i < pages.length; i++) {
      const pageNum = pages[i].page || (i + 1);
      const lines = pagesLines[i];
      
      let tocScore = 0;
      for (const line of lines) {
        if (line.match(/\|\s*\d+$/) || line.match(/\.{4,}/) || line.match(/\.\s*\d+$/)) tocScore++;
      }
      if (tocScore >= 4) continue; 

      for (const line of lines) {
        let cleanLine = line.replace(/<\/?[^>]+(>|$)/g, "").trim();
        if (cleanLine.length === 0) continue;
        if (repeatingLines.has(cleanLine) || cleanLine.match(/^Pag(ina|\.)?\s*\d+\s*\/\s*\d+$/i)) continue;

        const isMarkdownHeading = cleanLine.match(/^#{1,6}\s/);
        const isZucchettiH1 = cleanLine.match(/^(?:◆|■)\s/);
        const isZucchettiH2 = cleanLine.match(/^(?:>|►|›)\s/);
        const isAllCaps = (cleanLine === cleanLine.toUpperCase() && cleanLine.match(/[A-Z]/) && cleanLine.length > 3 && cleanLine.length < 60 && !cleanLine.includes('_'));

        if (isMarkdownHeading || isZucchettiH1 || isZucchettiH2 || isAllCaps) {
          
          if (testoAccumulato.trim().length > 0) {
            salvaChunkSemantico(currentH1, currentH2, paginaInizioBlocco, testoAccumulato);
          }
          
          let titleRaw = cleanLine.replace(/^[^a-zA-ZÀ-ÿ0-9]+/, '').trim();
          if (!titleRaw) titleRaw = "Sezione";
          
          let titleClean = titleRaw.charAt(0).toUpperCase() + titleRaw.slice(1).toLowerCase();

          if (isMarkdownHeading) {
            if (cleanLine.startsWith('# ')) { currentH1 = titleClean; currentH2 = ""; }
            else { currentH2 = titleClean; }
          } else if (isZucchettiH1 || isAllCaps) {
            currentH1 = titleClean;
            currentH2 = "";
          } else if (isZucchettiH2) {
            currentH2 = titleClean;
          }

          testoAccumulato = "";
          paginaInizioBlocco = pageNum;
        } else {
          testoAccumulato += cleanLine + "\n";
        }
      }
    }

    if (testoAccumulato.trim().length > 0) {
      salvaChunkSemantico(currentH1, currentH2, paginaInizioBlocco, testoAccumulato);
    }

    return NextResponse.json({ success: true, chunks: outputChunks });

  } catch (error: any) {
    console.error("Errore nel backend API:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}