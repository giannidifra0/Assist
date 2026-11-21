import type { ReactNode } from 'react';
import { requirePageAuth } from '@/lib/auth/server';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requirePageAuth();

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
