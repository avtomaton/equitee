/**
 * AuthContext — authentication state management.
 *
 * In self-hosted mode (TENANCY_MODE=single), the context exists but
 * user is always null and no auth enforcement happens.
 * In SaaS mode, it manages JWT tokens, login/register flows, and session state.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { auth } from '../api';
import type { User, AuthResponse } from '../types.ts';

interface VerifyEmailResponse {
  message: string;
  user: {
    email: string;
    tenant_id: string;
    is_admin?: boolean;
    id?: number;
    role?: string;
    email_verified?: boolean;
  };
}

interface ResendVerificationResponse {
  message: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (email: string, password: string, tenantName: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  updateUser: (newUserData: Partial<User>) => void;
  verifyEmail: (token: string) => Promise<VerifyEmailResponse>;
  resendVerification: (email: string) => Promise<ResendVerificationResponse>;
  loginWithGoogle: () => Promise<AuthResponse>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // On mount: try to validate any existing session via httpOnly cookie
  useEffect(() => {
    // Always try /auth/me — cookies are sent automatically via credentials: 'include'
    auth.me()
      .then((data) => {
        if (data && data.user) {
          setUser({
            ...data.user,
            tenant: data.tenant,
            is_admin: data.user.is_admin || false,
          });
        }
      })
      .catch(() => {
        // No valid session — that's fine for public views
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await auth.login(email, password);
    // Tokens are set via httpOnly cookies by the server — no localStorage needed
    setUser({
      email: data.user.email,
      tenant_id: data.user.tenant_id,
      is_admin: data.user.is_admin || false,
    });
    return data;
  }, []);

  const register = useCallback(async (email: string, password: string, tenantName: string) => {
    const data = await auth.register(email, password, tenantName);
    // Tokens are set via httpOnly cookies by the server
    setUser({
      email: data.user.email,
      tenant_id: data.user.tenant_id,
      is_admin: data.user.is_admin || false,
    });
    return data;
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    // Cookies are cleared by the server
    setUser(null);
  }, []);

  const updateUser = useCallback((newUserData: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...newUserData } : prev);
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    const data = await auth.verifyEmail(token);
    // Update user state if we have a current user
    if (user && data.user) {
      setUser(prev => prev ? { ...prev, email_verified: true } : prev);
    }
    return data;
  }, [user]);

  const resendVerification = useCallback(async (email: string) => {
    const data = await auth.resendVerification(email);
    return data;
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<AuthResponse> => {
    // Step 1: Get the Google authorization URL from the backend
    const initData = await auth.googleOAuthInit();
    const { authorization_url, state } = initData as { authorization_url: string; state: string };

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
      const handleMessage = async (event: MessageEvent) => {
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
          // Tokens are set via httpOnly cookies by the server — no localStorage needed
          const data = await auth.googleOAuthCallback(code, state);
          setUser({
            email: data.user.email,
            tenant_id: data.user.tenant_id,
            is_admin: data.user.is_admin || false,
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
      updateUser,
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
