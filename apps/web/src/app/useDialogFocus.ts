import { useEffect, useLayoutEffect, useRef } from 'react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialogFocus<T extends HTMLElement>(onClose: () => void, canClose = true) {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const canCloseRef = useRef(canClose);
  const setupVersion = useRef(0);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { canCloseRef.current = canClose; }, [canClose]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const currentSetup = ++setupVersion.current;

    const activeBeforeFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (activeBeforeFocus && !dialog.contains(activeBeforeFocus)) returnFocusRef.current = activeBeforeFocus;
    const getFocusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
    const initialFocus = dialog.querySelector<HTMLElement>('[data-dialog-autofocus], [autofocus]') ?? getFocusableElements()[0] ?? dialog;
    initialFocus.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (canCloseRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown);
      const returnFocus = returnFocusRef.current;
      if (returnFocus?.isConnected) {
        window.requestAnimationFrame(() => {
          if (setupVersion.current === currentSetup) returnFocus.focus();
        });
      }
    };
  }, []);

  return dialogRef;
}
