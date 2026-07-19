import { NextResponse } from 'next/server';

// ==========================================
// COSTANTI DI SISTEMA
// ==========================================
const API_BASE_URL = 'https://api.cloud.llamaindex.ai/api/v1';
const MAX_POLLING_ATTEMPTS = 40;
const POLLING_DELAY_MS = 2000;
const MAX_SEZIONE_ESTREMA = 3500;
const MIN_CHUNK_LENGTH = 20;

// ==========================================
// INTERFACCE TYPESCRIPT
// ==========================================
interface LlamaParsePage {
  page?: number;
  text?: string;
}

interface ChunkOutput {
  capitolo: string;
  pagina: number;
  testo: string;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    
    // Validazione rigorosa dell'input
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Nessun file fornito o formato non valido" }, { status: 400 });
    }

    const apiKey = process.env.LLAMAPARSE_API_KEY;
    if (!apiKey) {
      console.error("ERRORE SISTEMA: Chiave API LlamaParse mancante nell'ambiente.");
      return NextResponse.json({ error: "Errore di configurazione del server" }, { status: 500 });
    }

    // ==========================================
    // FASE 1: UPLOAD SU LLAMAPARSE
    // ==========================================
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);
    uploadFormData.append('result_type', 'markdown'); 
    uploadFormData.append('parsing_instruction', 'Extract as pure Markdown. Preserve tables strictly as markdown tables. Use # for main chapters (H1) and ## for sub-chapters (H2). CRITICAL INSTRUCTION: The document contains font rendering issues, custom ligatures, and bad text encoding (especially on italicized or highlighted text). You MUST actively reconstruct broken words, remove abnormal intra-word spacing, and fix garbled characters to output perfectly spelled Italian text.');

    const uploadRes = await fetch(`${API_BASE_URL}/parsing/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
      body: uploadFormData
    });

    if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(`Errore caricamento LlamaParse: ${uploadRes.status} - ${errorText}`);
    }
    const { id: jobId } = await uploadRes.json();

    // ==========================================
    // FASE 2: POLLING DELLO STATO
    // ==========================================
    let status = 'PENDING';
    let attempts = 0;
    
    while ((status === 'PENDING' || status === 'RUNNING') && attempts < MAX_POLLING_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, POLLING_DELAY_MS));
      
      const statusRes = await fetch(`${API_BASE_URL}/parsing/job/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
      });
      
      if (statusRes.ok) {
          const statusData = await statusRes.json();
          status = statusData.status;
      }
      attempts++;
    }

    if (status !== 'SUCCESS') {
        throw new Error(`Elaborazione fallita o andata in timeout. Stato finale: ${status}`);
    }

    // ==========================================
    // FASE 3: RECUPERO E PULIZIA DATI
    // ==========================================
    const resultRes = await fetch(`${API_BASE_URL}/parsing/job/${jobId}/result/json`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
    });
    
    if (!resultRes.ok) throw new Error("Impossibile recuperare i dati processati dal job");
    
    const resultData = await resultRes.json();
    const pages: LlamaParsePage[] = Array.isArray(resultData) ? (resultData[0]?.pages || []) : (resultData.pages || []);

    if (pages.length === 0) {
        return NextResponse.json({ success: true, chunks: [], message: "Documento vuoto o non processabile" });
    }

    // Calcolo frequenze righe (Logica intatta)
    const pagesLines = pages.map(p => (p.text || '').split('\n').map(l => l.trim()));
    const lineFrequencies = new Map<string, number>();

    pagesLines.forEach(lines => {
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

    // ==========================================
    // FASE 4: MOTORE DI CHUNKING
    // ==========================================
    const outputChunks: ChunkOutput[] = [];
    let currentH1 = "Introduzione";
    let currentH2 = "";
    let currentH3 = "";
    let testoAccumulato = "";
    let paginaInizioBlocco = 1;

    // Normalizzazione (Logica intatta)
    const unwrapperSemantico = (rawText: string): string => {
      let text = rawText.normalize('NFKC');
      text = text.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, "");
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

    // Salvataggio Intelligente basato su Concetti (Paragrafi)
    const salvaChunkSemantico = (h1: string, h2: string, h3: string, pagina: number, testo: string) => {
      let testoFinale = unwrapperSemantico(testo);
      if (testoFinale.length < MIN_CHUNK_LENGTH) return;

      // Costruzione dell'intestazione gerarchica
      let capitoloFinale = h1;
      if (h2) capitoloFinale += ` - ${h2}`;
      if (h3) capitoloFinale += ` - ${h3}`;

      // 1. Se il blocco entra nel limite, lo salviamo intero e chiudiamo.
      if (testoFinale.length <= MAX_SEZIONE_ESTREMA) {
        outputChunks.push({ capitolo: capitoloFinale, pagina, testo: testoFinale });
        return;
      }

      // ==========================================
      // 2. CHUNKING INTELLIGENTE PER CONCETTI
      // ==========================================
      // Dividiamo la sezione in blocchi logici (paragrafi, tabelle, liste) usando il doppio a capo.
      const paragrafi = testoFinale.split('\n\n');
      
      let chunkCorrente = "";
      let parte = 1;
      let ultimoParagrafo = ""; // Ci servirà per fare da 'ponte contestuale' tra i chunk

      for (let i = 0; i < paragrafi.length; i++) {
        let paragrafo = paragrafi[i].trim();
        if (!paragrafo) continue;

        // Se l'aggiunta di questo paragrafo supera il limite (e abbiamo già testo accumulato)...
        if (chunkCorrente.length + paragrafo.length > MAX_SEZIONE_ESTREMA && chunkCorrente.length > 0) {
          
          // Salviamo il "concetto" elaborato finora
          outputChunks.push({ 
            capitolo: `${capitoloFinale} (P. ${parte})`, 
            pagina, 
            testo: chunkCorrente.trim() 
          });
          
          parte++;
          
          // Iniziamo il nuovo blocco.
          // OVERLAP SEMANTICO: Portiamo dietro l'ultimo paragrafo logico del chunk precedente.
          // Questo dà al RAG il contesto di partenza. (Lo facciamo solo se non è un paragrafo enorme).
          if (ultimoParagrafo && ultimoParagrafo.length < 800) {
            chunkCorrente = ultimoParagrafo + "\n\n" + paragrafo;
          } else {
            chunkCorrente = paragrafo;
          }
          
        } else {
          // Se c'è ancora spazio, accodiamo fluidamente il paragrafo al concetto corrente
          chunkCorrente += (chunkCorrente ? "\n\n" : "") + paragrafo;
        }

        // Memorizziamo il paragrafo appena processato
        ultimoParagrafo = paragrafo;

        // --- FALLBACK DI EMERGENZA ---
        // Se un SINGOLO paragrafo (es. un muro di testo senza a capo o un codice lunghissimo) 
        // è più grande del limite assoluto, usiamo i punti fermi per tagliarlo ed evitare crash.
        if (chunkCorrente.length > MAX_SEZIONE_ESTREMA) {
             let splitIndex = chunkCorrente.lastIndexOf('. ', MAX_SEZIONE_ESTREMA);
             if (splitIndex === -1) splitIndex = MAX_SEZIONE_ESTREMA; // Taglio brutale se non c'è punteggiatura
             
             outputChunks.push({ 
                capitolo: `${capitoloFinale} (P. ${parte})`, 
                pagina, 
                testo: chunkCorrente.substring(0, splitIndex + 1).trim() 
             });
             chunkCorrente = chunkCorrente.substring(splitIndex + 1).trim();
             parte++;
        }
      }

      // Salva l'eventuale "coda" di testo rimasta alla fine del loop
      if (chunkCorrente.trim().length > 0) {
         outputChunks.push({ 
            capitolo: `${capitoloFinale} (P. ${parte})`, 
            pagina, 
            testo: chunkCorrente.trim() 
         });
      }
    };

    // Elaborazione linee (Logica intatta)
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
        const isZucchettiH3 = cleanLine.match(/^(?:•)\s/);
        
        const isAllCaps = (
            cleanLine === cleanLine.toUpperCase() && 
            cleanLine.match(/[A-Z]/) && 
            cleanLine.length > 5 && 
            cleanLine.length < 60 && 
            !cleanLine.includes('_') &&
            !cleanLine.match(/^(ATTENZIONE|NOTA|N\.B\.|NB:)/)
        );

        if (isMarkdownHeading || isZucchettiH1 || isZucchettiH2 || isZucchettiH3 || isAllCaps) {
          
          if (testoAccumulato.trim().length > 0) {
            salvaChunkSemantico(currentH1, currentH2, currentH3, paginaInizioBlocco, testoAccumulato);
          }
          
          let titleRaw = cleanLine.replace(/^[^a-zA-ZÀ-ÿ0-9]+/, '').trim();
          if (!titleRaw) titleRaw = "Sezione";
          
          let titleClean = titleRaw.charAt(0).toUpperCase() + titleRaw.slice(1).toLowerCase();

          if (isMarkdownHeading) {
            if (cleanLine.startsWith('# ')) { currentH1 = titleClean; currentH2 = ""; currentH3 = ""; }
            else if (cleanLine.startsWith('## ')) { currentH2 = titleClean; currentH3 = ""; }
            else { currentH3 = titleClean; }
          } else if (isZucchettiH1 || isAllCaps) {
            currentH1 = titleClean; currentH2 = ""; currentH3 = "";
          } else if (isZucchettiH2) {
            currentH2 = titleClean; currentH3 = "";
          } else if (isZucchettiH3) {
            currentH3 = titleClean;
          }

          testoAccumulato = "";
          paginaInizioBlocco = pageNum;
        } else {
          testoAccumulato += cleanLine + "\n";
        }
      }
    }

    if (testoAccumulato.trim().length > 0) {
      salvaChunkSemantico(currentH1, currentH2, currentH3, paginaInizioBlocco, testoAccumulato);
    }

    return NextResponse.json({ success: true, chunks: outputChunks });

  } catch (error: unknown) {
    console.error("Errore nel backend API:", error);
    const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto durante il parsing";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}