/**
 * AuthContext — authentication state management.
 *
 * In self-hosted mode (TENANCY_MODE=single), the context exists but
 * user is always null and no auth enforcement happens.
 * In SaaS mode, it manages JWT tokens, login/register flows, and session state.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: check for stored token and validate it
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      auth.me()
        .then((data) => {
          setUser({
            ...data.user,
            tenant: data.tenant,
          });
        })
        .catch(() => {
          // Token invalid or expired
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await auth.login(email, password);
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    setUser({
      email: data.user.email,
      tenant_id: data.user.tenant_id,
    });
    return data;
  };

  const register = async (email, password, tenantName) => {
    const data = await auth.register(email, password, tenantName);
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    setUser({
      email: data.user.email,
      tenant_id: data.user.tenant_id,
    });
    return data;
  };

  const logout = async () => {
    await auth.logout();
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export default AuthContext;
