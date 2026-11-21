import { requirePageAuth } from '@/lib/auth/server';
import { ProfileClient } from '@/components/dashboard/ProfileClient';

export default async function ProfilePage() {
  const user = await requirePageAuth();
  return <ProfileClient initialUser={user} />;
}
