import { useState } from 'react';
import { COLUMN_DEFS, getCookie, setCookie } from './config.js';

/**
 * Persist column visibility per view in a cookie.
 *
 * Auto-resets to defaults when the cookie is stale:
 *  - A stored key no longer exists in COLUMN_DEFS  →  invalid structure
 *  - The set of default-on keys changed in config  →  version bump
 * In either case the stale cookie is replaced with current defaults.
 *
 * Returns { visible, update, col, defs, isCustom, reset }
 *   col(key)  → boolean — is this column currently visible?
 *   isCustom  → true when visible differs from defaults (show reset affordance)
 *   reset()   → restore defaults and clear cookie
 */
export function useColumnVisibility(viewName) {
  const defs        = COLUMN_DEFS[viewName] || [];
  const validKeys   = new Set(defs.map(d => d.key));
  const defaultKeys = defs.filter(d => d.default).map(d => d.key);
  // Fingerprint of the current default set — stored alongside visible list
  // so we can detect when config defaults change between app versions.
  const defaultFingerprint = defaultKeys.join(',');
  const cookieKey = `re_cols_${viewName}`;

  const [visible, setVisible] = useState(() => {
    const saved = getCookie(cookieKey);
    if (saved) {
      try {
        const { cols, defaults } = JSON.parse(saved);
        const allValid = Array.isArray(cols) && cols.every(k => validKeys.has(k));
        const sameDefaults = defaults === defaultFingerprint;
        if (allValid && sameDefaults && cols.length > 0) return cols;
      } catch {}
    }
    // Stale, corrupt, or absent — use current defaults (no cookie written yet)
    return defaultKeys;
  });

  const update = (keys) => {
    setVisible(keys);
    setCookie(cookieKey, JSON.stringify({ cols: keys, defaults: defaultFingerprint }));
  };

  const reset = () => {
    setVisible(defaultKeys);
    // Delete by expiring the cookie
    document.cookie = `${cookieKey}=;max-age=0;path=/`;
  };

  const col = (key) => visible.includes(key);

  const isCustom = visible.join(',') !== defaultKeys.join(',');

  return { visible, update, col, defs, isCustom, reset };
}
