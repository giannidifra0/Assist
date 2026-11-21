import type { UserRole } from '@/lib/types/domain';

export type Permission =
  | 'chat:use'
  | 'kb:read'
  | 'kb:write'
  | 'kb:delete'
  | 'manuals:read'
  | 'manuals:manage'
  | 'ai:sync_embeddings'
  | 'telemetry:read'
  | 'users:manage';

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: [
    'chat:use',
    'kb:read',
    'kb:write',
    'kb:delete',
    'manuals:read',
    'manuals:manage',
    'ai:sync_embeddings',
    'telemetry:read',
    'users:manage',
  ],
  editor: [
    'chat:use',
    'kb:read',
    'kb:write',
    'kb:delete',
    'manuals:read',
    'manuals:manage',
    'ai:sync_embeddings',
  ],
  utente: ['chat:use', 'kb:read', 'manuals:read'],
};

export interface RoleMeta {
  value: UserRole;
  label: string;
  description: string;
  badgeClass: string;
}

export const ROLE_META: Record<UserRole, RoleMeta> = {
  admin: {
    value: 'admin',
    label: 'Amministratore',
    description: 'Accesso completo: utenti, telemetria, KB, manuali e assistente IA.',
    badgeClass:
      'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white',
  },
  editor: {
    value: 'editor',
    label: 'Redattore',
    description: 'Può gestire schede Knowledge Base, manuali PDF e sincronizzare i vettori IA.',
    badgeClass:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/80',
  },
  utente: {
    value: 'utente',
    label: 'Operatore',
    description: 'Consultazione Knowledge Base, download manuali PDF e uso Assistente IA.',
    badgeClass:
      'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
  },
};

export function normalizeRole(role?: string | null): UserRole {
  const normalized = role?.trim().toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'editor') return 'editor';
  return 'utente';
}

export function isValidRole(value: unknown): value is UserRole {
  return value === 'admin' || value === 'editor' || value === 'utente';
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
