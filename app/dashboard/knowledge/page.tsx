import { requirePageAuth } from '@/lib/auth/server';
import { KnowledgeClient } from '@/components/dashboard/KnowledgeClient';

export default async function KnowledgePage() {
  const user = await requirePageAuth('kb:read');
  return <KnowledgeClient userRole={user.ruolo} />;
}
