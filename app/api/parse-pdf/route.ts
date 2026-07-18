import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // 1. Riceviamo il file dalla Dashboard
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: "Nessun file fornito" }, { status: 400 });
    }

    // 2. Prepariamo il pacchetto da spedire a Flask
    const flaskFormData = new FormData();
    flaskFormData.append('file', file);

    // 3. Spediamo il file al nostro Microservizio Python locale (Porta 5000)
    // NOTA: Quando metteremo il Python online su Render, cambieremo solo questo URL!
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:5000/parse';

    const flaskResponse = await fetch(pythonApiUrl, {
      method: 'POST',
      body: flaskFormData,
    });

    const data = await flaskResponse.json();

    if (!flaskResponse.ok || !data.success) {
      throw new Error(data.error || "Errore sconosciuto dal motore Docling");
    }

    // 4. Restituiamo i frammenti puliti alla Dashboard
    return NextResponse.json({ success: true, chunks: data.chunks });

  } catch (error: any) {
    console.error("Errore di comunicazione col microservizio:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}