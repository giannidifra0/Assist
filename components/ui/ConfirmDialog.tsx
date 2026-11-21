'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Conferma',
  cancelLabel = 'Annulla',
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissible={!isLoading}
      icon={<AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />}
      footer={
        <>
          <button
            type="button"
            autoFocus
            disabled={isLoading}
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">{description}</p>
    </ModalDialog>
  );
}
