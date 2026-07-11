import { redirect } from 'next/navigation';

export default function Home() {
  // Rimanda automaticamente chiunque visiti la pagina principale dritti alla dashboard
  // (il layout della dashboard che abbiamo creato prima si accorgerà se l'utente 
  // non è loggato e lo spedirà in automatico al login).
  redirect('/dashboard');
}