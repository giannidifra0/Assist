import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    // 1. SCRAPING DELLA PAGINA PER TROVARE L'URL DINAMICO
    const baseUrl = 'https://www.cnel.it';
    const pageResponse = await fetch(`${baseUrl}/archivio-contratti/contratti-open-data`, { 
      cache: 'no-store' 
    });
    
    if (!pageResponse.ok) {
        throw new Error(`Impossibile raggiungere il sito CNEL. Stato: ${pageResponse.status}`);
    }
    
    const html = await pageResponse.text();

    // REGEX MIGLIORATA: Cerca qualsiasi href che contenga "archivio_corrente", 
    // con apici singoli o doppi, a prescindere che finisca con .json o no.
    const regex = /href=['"]([^'"]*archivio_corrente[^'"]*)['"]/i;
    const match = html.match(regex);

    if (!match || !match[1]) {
      console.error("[CNEL Sync] Estratto HTML parziale:", html.substring(0, 500));
      return NextResponse.json({ success: false, error: "Link al JSON 'Archivio Corrente' non trovato sulla pagina del CNEL. Struttura HTML cambiata." }, { status: 404 });
    }

    // Costruiamo l'URL completo
    const rawUrl = match[1];
    const jsonUrl = rawUrl.startsWith('http') ? rawUrl : `${baseUrl}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    console.log(`[CNEL Sync] Trovato URL del file aggiornato: ${jsonUrl}`);

    // 2. DOWNLOAD DEL FILE JSON
    const jsonResponse = await fetch(jsonUrl);
    
    if (!jsonResponse.ok) {
      throw new Error(`Impossibile scaricare il file JSON. Stato: ${jsonResponse.status}`);
    }

    const jsonData = await jsonResponse.json();

    if (!jsonData.data || !Array.isArray(jsonData.data)) {
       throw new Error("Formato JSON non valido o chiave 'data' mancante.");
    }

    const contratti = jsonData.data;
    let upsertedCount = 0;

    // 3. MAPPATURA E UPSERT A BLOCCHI (CHUNKING)
    const chunkSize = 100;
    
    for (let i = 0; i < contratti.length; i += chunkSize) {
      const chunk = contratti.slice(i, i + chunkSize).map((c: any) => ({
        id_accordo: c.idAccordo,
        id_accordo_string: c.idAccordoString,
        identificativo_accordo: c.identificativoAccordo,
        identificativo_richiesta_pud: c.identificativoRichiestaPud,
        id_ccnl: c.idCcnl,
        codice_ccnl: c.codiceCcnl,
        codice_ambito: c.codiceAmbito,
        ambito: c.ambito,
        comparto: c.comparto,
        sezione: c.sezione,
        titolo: c.titolo,
        titolo_ccnl: c.titoloCcnl,
        tipologia_accordo: c.tipologiaAccordo,
        stato: c.stato,
        stato_aa: c.statoAA,
        data_stipula: c.dataStipula || null,
        data_decorrenza: c.dataDecorrenza || null,
        data_scadenza_contrattuale: c.dataScadenzaContrattuale || null,
        data_scadenza_economica: c.dataScadenzaEconomica || null,
        dipendenti: c.dipendenti,
        parti_datoriali_firmatarie: c.partiDatorialiFirmatarie || [],
        parti_sindacali_firmatarie: c.partiSindacaliFirmatarie || [],
        settori: c.settori || [],
        settori_descrizione: c.settoriDescrizione || [],
        sottosettori_descrizione: c.sottosettoriDescrizione || [],
        settori_ateco: c.settoriAteco || [],
        settori_ateco_descrizione: c.settoriAtecoDescrizione || [],
        sottosettori_ateco_descrizione: c.sottosettoriAtecoDescrizione || [],
        regione: c.regione || [],
        provincia: c.provincia || [],
        comune: c.comune || [],
        testo: c.testo,
        tipo_ricezione: c.tipoRicezione,
        note: c.note,
        ultimo_accordo_vigente: c.ultimoAccordoVigente,
        visibile_online: c.visibileOnline,
        utente_assegnatario: c.utenteAssegnatario
      }));

      const { error } = await supabase
        .from('cnel_contratti')
        .upsert(chunk, { onConflict: 'id_accordo' });

      if (error) {
          console.error(`[CNEL Sync] Errore nell'upsert al blocco ${i}:`, error.message);
          throw error;
      }
      
      upsertedCount += chunk.length;
    }

    return NextResponse.json({ 
        success: true, 
        message: `Sincronizzazione completata con successo. ${upsertedCount} contratti elaborati.` 
    });

  } catch (error: any) {
    console.error("Errore fatale sincronizzazione CNEL:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}