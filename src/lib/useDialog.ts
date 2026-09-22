import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, innermost last. Only the innermost one keeps focus inside itself. */
const openDialogs: HTMLElement[] = [];

/**
 * Makes an element behave as a modal dialog for keyboard users: focus moves into it when it opens (to the element
 * marked `data-autofocus`, else the first focusable one), Tab and Shift+Tab cycle inside it, and focus goes back to
 * where it was when the dialog closes. Put the returned ref on the dialog element and give it tabIndex={-1}.
 */
export function useDialog<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogs.push(node);

    const focusable = () => [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    (node.querySelector<HTMLElement>('[data-autofocus]') ?? focusable()[0] ?? node).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || openDialogs.at(-1) !== node) return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      openDialogs.splice(openDialogs.indexOf(node), 1);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return ref;
}
