import { requirePageAuth } from '@/lib/auth/server';
import { UsersClient } from '@/components/dashboard/UsersClient';

export default async function UsersPage() {
  const user = await requirePageAuth('users:manage');
  return <UsersClient currentUserId={user.id} />;
}
