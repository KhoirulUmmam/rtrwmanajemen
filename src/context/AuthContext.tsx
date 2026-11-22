import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

type UserRole = 'admin' | 'resident' | null;

interface AuthContextType {
  role: UserRole;            // 'admin' juga dipakai untuk super admin (cek isSuperAdmin)
  isSuperAdmin: boolean;
  user: any | null;
  rtId: string | null;
  token: string | null;
  setSession: (token: string, user: any) => void;
  updateUser: (user: any) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

function safeStorage<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

/**
 * Tambahkan token ke semua request ke /api secara otomatis, dan logout bila server membalas 401.
 * Dipasang sekali saja, sehingga halaman cukup memakai fetch('/api/...') seperti biasa.
 */
let fetchPatched = false;
function patchFetch(onUnauthorized: () => void) {
  if (fetchPatched) return;
  fetchPatched = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isApi = url.startsWith('/api') || url.startsWith(`${window.location.origin}/api`);
    if (!isApi) return original(input, init);

    const token = safeStorage(() => localStorage.getItem(TOKEN_KEY), null);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

    const response = await original(input, { ...init, headers });
    if (response.status === 401 && !url.includes('/api/auth/')) onUnauthorized();
    return response;
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => safeStorage(() => localStorage.getItem(TOKEN_KEY), null));
  const [user, setUser] = useState<any | null>(() => safeStorage(() => JSON.parse(localStorage.getItem(USER_KEY) || 'null'), null));

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    safeStorage(() => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      // bersihkan sisa penyimpanan versi lama
      localStorage.removeItem('auth_role');
      localStorage.removeItem('auth_rt_id');
    }, undefined);
  }, []);

  useEffect(() => {
    patchFetch(() => {
      logout();
      if (window.location.pathname !== '/login') window.location.assign('/login');
    });
  }, [logout]);

  // Sesi versi lama (tanpa token) tidak berlaku lagi
  useEffect(() => {
    if (!token && user) logout();
  }, [token, user, logout]);

  const setSession = (newToken: string, newUser: any) => {
    setToken(newToken);
    setUser(newUser);
    safeStorage(() => {
      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    }, undefined);
  };

  const updateUser = (newUser: any) => {
    setUser(newUser);
    safeStorage(() => localStorage.setItem(USER_KEY, JSON.stringify(newUser)), undefined);
  };

  const rawRole = token && user ? user.role : null;
  const role: UserRole = rawRole === 'resident' ? 'resident' : rawRole ? 'admin' : null;

  return (
    <AuthContext.Provider value={{
      role,
      isSuperAdmin: rawRole === 'superadmin',
      user: token ? user : null,
      rtId: token && user ? user.rtId : null,
      token,
      setSession,
      updateUser,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
