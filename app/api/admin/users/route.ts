import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { action, id, email, originalEmail, password, nominativo, username, ruolo, attivo } = await req.json();
    
    // Inizializziamo Supabase in "God Mode" usando la Service Role Key per bypassare l'RLS
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // ==========================================
    // CREAZIONE NUOVO UTENTE (Registrazione Admin)
    // ==========================================
    if (action === 'CREATE') {
      // 1. Crea l'utente sicuro in Authentication
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true // Salta la conferma via mail obbligatoria
      });
      
      if (authError || !authData.user) {
        throw new Error(`Errore di sicurezza Supabase: ${authError?.message || 'Utente non creato'}`);
      }

      // 2. Crea la riga nel gestionale USANDO LO STESSO IDENTICO ID
      const { error: dbError } = await supabaseAdmin.from('utenti').insert([{
        id: authData.user.id, // <-- Collegamento cruciale tra Auth e Tabella
        email: email,
        username: username,
        ruolo: ruolo,
        attivo: attivo,
        nominativo: nominativo,
        is_online: false
        // 'data_creazione' non serve passarlo, Postgres lo compila da solo (timestamptz)
      }]);

      // 3. Meccanismo di sicurezza (Rollback)
      if (dbError) {
        // Se il DB fallisce, eliminiamo l'utente appena creato dall'Auth per mantenere il sistema pulito
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw new Error(`Errore di scrittura nel Database: ${dbError.message}`);
      }

      return NextResponse.json({ success: true });
    }

    // ==========================================
    // AGGIORNAMENTO E CANCELLAZIONE
    // ==========================================
    // Cerca l'utente in Auth per le operazioni successive
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = users.find(u => u.email === (originalEmail || email));

    if (action === 'UPDATE') {
      // Se è stata inserita una nuova password, aggiornala in Auth
      if (authUser && password) {
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password });
        if (authError) throw new Error(`Errore aggiornamento Password Auth: ${authError.message}`);
      }

      // Aggiorna l'anagrafica
      const { error: dbError } = await supabaseAdmin.from('utenti').update({
        email, username, ruolo, attivo, nominativo
      }).eq('id', id);
      
      if (dbError) throw new Error(`Errore aggiornamento DB: ${dbError.message}`);

      return NextResponse.json({ success: true });
    }

    if (action === 'DELETE') {
      // Cancella prima dal gestionale
      await supabaseAdmin.from('utenti').delete().eq('id', id);
      // Poi distruggi l'accesso in sicurezza
      if (authUser) {
        await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Azione non valida' }, { status: 400 });
  } catch (error: any) {
    console.error("Errore API Admin Users:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}