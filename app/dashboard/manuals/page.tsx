import { requirePageAuth } from '@/lib/auth/server';
import { ManualsClient } from '@/components/dashboard/ManualsClient';

export default async function ManualsPage() {
  const user = await requirePageAuth('manuals:read');
  return <ManualsClient userRole={user.ruolo} />;
}
