/**
 * AuthGuard — protects routes when running in SaaS mode.
 *
 * In self-hosted mode (TENANCY_MODE=single), this is a transparent pass-through.
 * In SaaS mode, returns true/false so the caller can redirect.
 *
 * Since the app uses hash-based routing (no react-router), this is
 * a function rather than a component.
 */

// Detect SaaS mode — if the env var is not set, default to single (self-hosted)
const isSaasMode = import.meta.env.VITE_TENANCY_MODE === 'saas';

/**
 * Check if the current user is authenticated.
 *
 * @param {object} user - The user object from AuthContext
 * @returns {boolean} true if access is allowed
 */
export function isAuthenticated(user) {
  // Self-hosted mode: always allow
  if (!isSaasMode) return true;
  // SaaS mode: require user
  return !!user;
}

/**
 * Get the redirect target for unauthenticated users.
 * @returns {string} hash route
 */
export function getLoginRedirectHash() {
  return '#/login';
}

export { isSaasMode };
