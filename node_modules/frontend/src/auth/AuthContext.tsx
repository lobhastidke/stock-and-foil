/**
 * auth/AuthContext.tsx
 *
 * Provides the current user (from GET /auth/me on mount) to the whole app.
 * No token in localStorage — auth is the httpOnly cookie set by the server.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { getMe, login as apiLogin, logout as apiLogout, register as apiRegister } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import type { User, Role } from '../api/types.js';

// -----------------------------------------------------------------------
// Context shape
// -----------------------------------------------------------------------
interface AuthContextValue {
  user: User | null;
  /** true while the initial /auth/me call is in progress */
  initialising: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  register: (body: {
    email: string;
    password: string;
    displayName: string;
    organisation: string;
    role: Role;
  }) => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// -----------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initialising, setInitialising] = useState(true);

  // On mount: try to resume session from the httpOnly cookie
  useEffect(() => {
    getMe()
      .then(({ user: u }) => setUser(u))
      .catch((e: unknown) => {
        // UNAUTHENTICATED is expected when not logged in — suppress it
        if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') return;
        console.error('[Auth] getMe failed:', e);
      })
      .finally(() => setInitialising(false));
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const { user: u } = await apiLogin({ email, password });
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await apiLogout();
    setUser(null);
  }, []);

  const register = useCallback(
    async (body: {
      email: string;
      password: string;
      displayName: string;
      organisation: string;
      role: Role;
    }): Promise<User> => {
      const { user: u } = await apiRegister(body);
      setUser(u);
      return u;
    },
    [],
  );

  return (
    <AuthContext.Provider value={{ user, initialising, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

// -----------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
