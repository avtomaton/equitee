import { useState, useRef } from 'react';

/**
 * useSilentLoading — "show spinner only on the very first load" pattern.
 *
 * Returns { loading, wrapLoad, hasLoadedRef }.
 *
 * Call `await wrapLoad(asyncFn)` instead of managing setLoading yourself:
 *   - First call:  sets loading=true, runs asyncFn, sets loading=false.
 *   - All subsequent calls: runs asyncFn silently (no loading flash, no
 *     page-height collapse, no scroll-position clamping).
 *
 * hasLoadedRef.current can be read externally to guard "initial-load-only"
 * effects without adding it as a reactive dependency.
 */
export function useSilentLoading() {
  const [loading, setLoading]  = useState(true);
  const hasLoadedRef           = useRef(false);

  const wrapLoad = async (fn) => {
    const isFirst = !hasLoadedRef.current;
    try {
      if (isFirst) setLoading(true);
      await fn();
      hasLoadedRef.current = true;
    } finally {
      if (isFirst) setLoading(false);
    }
  };

  return { loading, wrapLoad, hasLoadedRef };
}
