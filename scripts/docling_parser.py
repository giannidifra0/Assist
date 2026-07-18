import sys
import json
import re
from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker

def pulisci_titolo(testo):
    if not testo:
        return "Sezione"
    pulito = re.sub(r'[^a-zA-ZàèéìíòóùúÀÈÉÌÍÒÓÙÚ\s]', ' ', testo)
    pulito = re.sub(r'\s+', ' ', pulito).strip()
    return pulito.capitalize() if pulito else "Sezione"

def is_indice(heading, text):
    titolo_lower = heading.lower()
    if 'indice' in titolo_lower or 'sommario' in titolo_lower or 'table of contents' in titolo_lower:
        return True
    if '....' in text or '___' in text:
        return True
    return False

def main(file_path):
    try:
        converter = DocumentConverter()
        result = converter.convert(file_path)
        doc = result.document

        chunker = HybridChunker()
        chunk_iter = chunker.chunk(doc)

        output_chunks = []
        chunk_corrente = None
        
        # Limite massimo di caratteri per un singolo chunk (circa 2-3 paragrafi grandi)
        MAX_CHUNK_LENGTH = 2000 

        for i, chunk in enumerate(chunk_iter):
            testo_estratto = chunk.text.strip()
            heading_raw = chunk.meta.headings[0] if chunk.meta.headings else ""
            
            if is_indice(heading_raw, testo_estratto):
                continue
            
            capitolo_pulito = pulisci_titolo(heading_raw)
            
            pagina = 1
            if chunk.meta.doc_items:
                for item in chunk.meta.doc_items:
                    if hasattr(item, 'prov') and item.prov:
                        pagina = item.prov[0].page_no
                        break

            # Ignoriamo i residui minuscoli (es. numeri di pagina isolati)
            if len(testo_estratto) < 20:
                continue
                
            # =================================================================
            # MAGIA: AGGREGAZIONE SEMANTICA
            # =================================================================
            if chunk_corrente and chunk_corrente["capitolo"] == capitolo_pulito and chunk_corrente["pagina"] == pagina:
                # Se siamo nello stesso capitolo/pagina e c'è spazio, uniamo il testo!
                if len(chunk_corrente["testo"]) + len(testo_estratto) < MAX_CHUNK_LENGTH:
                    chunk_corrente["testo"] += f"\n{testo_estratto}"
                else:
                    # Se il chunk sta diventando troppo grosso, lo salviamo e ne iniziamo uno nuovo
                    output_chunks.append(chunk_corrente)
                    chunk_corrente = {
                        "capitolo": capitolo_pulito,
                        "pagina": pagina,
                        "testo": testo_estratto
                    }
            else:
                # Se cambia il capitolo o la pagina, salviamo il vecchio e partiamo col nuovo
                if chunk_corrente:
                    output_chunks.append(chunk_corrente)
                chunk_corrente = {
                    "capitolo": capitolo_pulito,
                    "pagina": pagina,
                    "testo": testo_estratto
                }

        # Aggiungiamo l'ultimissimo blocco rimasto in canna alla fine del ciclo
        if chunk_corrente:
            output_chunks.append(chunk_corrente)

        print(json.dumps(output_chunks))

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        main(sys.argv[1])
    else:
        print(json.dumps({"error": "Nessun percorso file fornito"}), file=sys.stderr)
        sys.exit(1)