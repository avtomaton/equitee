/**
 * AuthContext — authentication state management.
 *
 * In self-hosted mode (TENANCY_MODE=single), the context exists but
 * user is always null and no auth enforcement happens.
 * In SaaS mode, it manages JWT tokens, login/register flows, and session state.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

  const login = useCallback(async (email, password) => {
    const data = await auth.login(email, password);
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    setUser({
      email: data.user.email,
      tenant_id: data.user.tenant_id,
    });
    return data;
  }, []);

  const register = useCallback(async (email, password, tenantName) => {
    const data = await auth.register(email, password, tenantName);
    // After registration, store tokens but user may not be verified yet
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    setUser({
      email: data.user.email,
      tenant_id: data.user.tenant_id,
    });
    return data;
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  }, []);

  const verifyEmail = useCallback(async (token) => {
    const data = await auth.verifyEmail(token);
    // Update user state if we have a current user
    if (user && data.user) {
      setUser(prev => prev ? { ...prev, email_verified: true } : prev);
    }
    return data;
  }, [user]);

  const resendVerification = useCallback(async (email) => {
    const data = await auth.resendVerification(email);
    return data;
  }, []);

  const loginWithGoogle = useCallback(async () => {
    // Step 1: Get the Google authorization URL from the backend
    const initData = await auth.googleOAuthInit();
    const { authorization_url, state } = initData;

    // Step 2: Open Google OAuth in a popup window
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authorization_url,
      'google-oauth',
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    // Step 3: Listen for the callback message from the popup
    return new Promise((resolve, reject) => {
      const handleMessage = async (event) => {
        // Accept messages from any origin (Google redirects)
        if (event.data?.type !== 'google-oauth-callback') return;

        window.removeEventListener('message', handleMessage);
        popup?.close();

        const { code, state: returnedState, error } = event.data;

        if (error) {
          reject(new Error(error));
          return;
        }

        if (returnedState !== state) {
          reject(new Error('Security validation failed. Please try again.'));
          return;
        }

        try {
          // Step 4: Send the code to our backend
          const data = await auth.googleOAuthCallback(code, state);
          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('refresh_token', data.refresh_token);
          setUser({
            email: data.user.email,
            tenant_id: data.user.tenant_id,
          });
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };

      window.addEventListener('message', handleMessage);

      // Timeout after 5 minutes
      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        popup?.close();
        reject(new Error('Google Sign-In timed out. Please try again.'));
      }, 5 * 60 * 1000);
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      login,
      register,
      logout,
      verifyEmail,
      resendVerification,
      loginWithGoogle,
      loading,
    }}>
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
