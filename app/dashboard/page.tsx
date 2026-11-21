import { requirePageAuth } from '@/lib/auth/server';
import { DashboardClient } from '@/components/dashboard/DashboardClient';

export default async function DashboardHomePage() {
  const user = await requirePageAuth();
  return <DashboardClient user={user} />;
}
