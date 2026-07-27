import { useEffect } from 'react';

/** Closes a modal when the user presses Escape. Small, consistent UX touch
 * used across all popup/modal components in the app. */
export function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape]);
}
