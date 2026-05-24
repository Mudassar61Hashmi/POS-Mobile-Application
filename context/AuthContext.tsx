import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, getToken, removeToken, saveToken } from '@/lib/api';

type User = { id: string; name: string; username: string; role: string };

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login(username: string, password: string): Promise<string | null>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        const r = await apiFetch('/api/me').catch(() => null);
        if (r?.ok) {
          const d = await r.json();
          setUser({ id: d._id, name: d.name, username: d.username, role: d.role });
        } else {
          await removeToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(username: string, password: string): Promise<string | null> {
    try {
      const r = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (!r.ok) return d.message || 'Login failed';
      await saveToken(d.token);
      setUser({ id: d.user.id, name: d.user.name, username: d.user.username, role: d.user.role });
      return null;
    } catch (e: any) {
      return e.message || 'Network error — check server URL in lib/config.ts';
    }
  }

  async function logout() {
    await removeToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
