import os
import json
import re
import tempfile
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
from docling.document_converter import DocumentConverter
from docling.chunking import HybridChunker

app = Flask(__name__)

def pulisci_titolo(testo):
    if not testo: return "Sezione"
    pulito = re.sub(r'[^a-zA-ZàèéìíòóùúÀÈÉÌÍÒÓÙÚ\s]', ' ', testo)
    pulito = re.sub(r'\s+', ' ', pulito).strip()
    return pulito.capitalize() if pulito else "Sezione"

@app.route('/parse', methods=['POST'])
def parse_pdf():
    try:
        # Verifica che il file sia stato inviato
        if 'file' not in request.files:
            return jsonify({"success": False, "error": "Nessun file fornito"}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({"success": False, "error": "Nome file vuoto"}), 400

        # Salva in una cartella temporanea sicura
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, secure_filename(file.filename))
        file.save(temp_path)

        # Motore Docling
        converter = DocumentConverter()
        result = converter.convert(temp_path)
        
        chunker = HybridChunker()
        chunk_iter = chunker.chunk(result.document)

        output_chunks = []
        chunk_corrente = None
        MAX_CHUNK_LENGTH = 2000

        for i, chunk in enumerate(chunk_iter):
            testo_estratto = chunk.text.strip()
            heading_raw = chunk.meta.headings[0] if chunk.meta.headings else ""
            
            if 'indice' in heading_raw.lower() or '....' in testo_estratto:
                continue
            
            capitolo_pulito = pulisci_titolo(heading_raw)
            
            pagina = 1
            if chunk.meta.doc_items:
                for item in chunk.meta.doc_items:
                    if hasattr(item, 'prov') and item.prov:
                        pagina = item.prov[0].page_no
                        break

            if len(testo_estratto) < 20: continue

            if chunk_corrente and chunk_corrente["capitolo"] == capitolo_pulito and chunk_corrente["pagina"] == pagina:
                if len(chunk_corrente["testo"]) + len(testo_estratto) < MAX_CHUNK_LENGTH:
                    chunk_corrente["testo"] += f"\n{testo_estratto}"
                else:
                    output_chunks.append(chunk_corrente)
                    chunk_corrente = {"capitolo": capitolo_pulito, "pagina": pagina, "testo": testo_estratto}
            else:
                if chunk_corrente: output_chunks.append(chunk_corrente)
                chunk_corrente = {"capitolo": capitolo_pulito, "pagina": pagina, "testo": testo_estratto}

        if chunk_corrente: output_chunks.append(chunk_corrente)

        # Pulizia file temporaneo
        try: os.remove(temp_path)
        except: pass

        return jsonify({"success": True, "chunks": output_chunks})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    # Avvia il server sulla porta 5000
    app.run(host='0.0.0.0', port=5000)