'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  variant?: 'centered' | 'drawer';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissible?: boolean;
  children: ReactNode;
}

const SIZE_CLASSES: Record<'centered' | 'drawer', Record<'sm' | 'md' | 'lg' | 'xl', string>> = {
  centered: {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-4xl',
  },
  drawer: {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-xl',
    xl: 'max-w-2xl',
  },
};

export function ModalDialog({
  open,
  onClose,
  title,
  subtitle,
  icon,
  headerActions,
  footer,
  variant = 'centered',
  size = 'lg',
  dismissible = true,
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };

    const handleCancel = (event: Event) => {
      if (!dismissible) {
        event.preventDefault();
      }
    };

    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('cancel', handleCancel);

    // Fallback light-dismiss per browser che non supportano ancora <dialog closedby="any">
    let cleanupFallback: (() => void) | undefined;
    if (dismissible && !('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;

      const isOutside = (e: PointerEvent) => {
        const rect = dialog.getBoundingClientRect();
        return (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        );
      };

      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e) && dialog.open) {
          dialog.close();
        }
        pressedOutside = false;
      };

      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      cleanupFallback = () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('cancel', handleCancel);
      cleanupFallback?.();
    };
  }, [dismissible, onClose]);

  const widthClass = SIZE_CLASSES[variant][size];
  const positionClass =
    variant === 'drawer'
      ? `m-0 ml-auto mr-0 h-dvh max-h-dvh w-full ${widthClass} rounded-none sm:rounded-l-[2rem] border-l border-zinc-200 dark:border-zinc-800`
      : `m-auto w-[calc(100%-1.5rem)] ${widthClass} max-h-[90dvh] rounded-[2rem] border border-zinc-200/80 dark:border-zinc-800`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: dismissible ? 'any' : 'none' } as Record<string, string>)}
      className={`${positionClass} open:flex flex-col p-0 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden`}
    >
      <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <div className="p-2 bg-zinc-100 dark:bg-zinc-900 rounded-xl shrink-0">{icon}</div>
          )}
          <div className="min-w-0">
            <h2 id={titleId} className="text-base md:text-lg font-bold text-zinc-900 dark:text-white truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerActions}
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Chiudi finestra"
            className="p-2 bg-zinc-50 dark:bg-zinc-900 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-xl transition-colors border border-zinc-200/60 dark:border-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-7 custom-scrollbar bg-zinc-50/40 dark:bg-zinc-950">
        {children}
      </div>

      {footer && (
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center justify-end gap-2.5 shrink-0">
          {footer}
        </div>
      )}
    </dialog>
  );
}
