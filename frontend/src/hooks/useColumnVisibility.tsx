import { useState } from 'react';
import { COLUMN_DEFS, getCookie, setCookie } from '../config.js';

/**
 * Persist column visibility per view in a cookie.
 *
 * Auto-resets to defaults when the cookie is stale:
 *  - A stored key no longer exists in COLUMN_DEFS  →  invalid structure
 *  - The set of default-on keys changed in config  →  version bump
 *
 * @param viewName - The name of the view (must be a key in COLUMN_DEFS)
 * @returns Object with:
 *   visible (string[]): Array of currently visible column keys
 *   update (function): Function to update visible columns and persist to cookie
 *   col (function): Function that takes a column key and returns boolean visibility
 *   defs (ColumnDef[]): Column definitions for the view
 *   isCustom (boolean): True when visible differs from defaults (show reset affordance)
 *   reset (function): Function to restore defaults and clear cookie
 */
export function useColumnVisibility(viewName: string) {
  const defs = COLUMN_DEFS[viewName as keyof typeof COLUMN_DEFS] || [];
  const validKeys = new Set(defs.map((d: { key: string }) => d.key));
  const defaultKeys = defs.filter((d: { default: boolean }) => d.default).map((d: { key: string }) => d.key);
  const defaultFingerprint = defaultKeys.join(',');
  const cookieKey = `re_cols_${viewName}`;

  const [visible, setVisible] = useState<string[]>(() => {
    const saved = getCookie(cookieKey);
    if (saved) {
      try {
        const { cols, defaults } = JSON.parse(saved);
        const allValid = Array.isArray(cols) && cols.every(k => validKeys.has(k));
        const sameDefaults = defaults === defaultFingerprint;
        if (allValid && sameDefaults && cols.length > 0) return cols;
      } catch {
        // Ignore malformed saved data
      }
    }
    return defaultKeys;
  });

  const update = (keys: string[]) => {
    setVisible(keys);
    setCookie(cookieKey, JSON.stringify({ cols: keys, defaults: defaultFingerprint }));
  };

  const reset = () => {
    setVisible(defaultKeys);
    document.cookie = `${cookieKey}=;max-age=0;path=/`;
  };

  const col = (key: string): boolean => visible.includes(key);
  const isCustom = visible.join(',') !== defaultKeys.join(',');

  return { visible, update, col, defs, isCustom, reset };
}