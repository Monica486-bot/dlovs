import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import api from '../api/client';

export interface DlovsUser {
  user_id: number;
  full_name: string;
  role: 'citizen' | 'land_officer' | 'administrator';
  platform: string;
  phone_number: string;
  national_id: string | null;
  national_id_verified: boolean;
}

interface AuthContextValue {
  user: DlovsUser | null;
  isStaff: boolean;
  login: (phone_number: string, password: string) => Promise<DlovsUser>;
  logout: () => void;
  updateUser: (changes: Partial<DlovsUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const STAFF_ROLES = ['land_officer', 'administrator'];

function storedUser(): DlovsUser | null {
  try {
    const stored = localStorage.getItem('dlovs_user');
    return stored ? (JSON.parse(stored) as DlovsUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DlovsUser | null>(storedUser);

  useEffect(() => {
    if (!localStorage.getItem('dlovs_token')) return;
    api.get('/auth/me')
      .then(({ data }) => {
        localStorage.setItem('dlovs_user', JSON.stringify(data));
        setUser(data as DlovsUser);
      })
      .catch(() => {});
  }, []);

  async function login(phone_number: string, password: string): Promise<DlovsUser> {
    const { data } = await api.post('/auth/login', { phone_number, password });
    localStorage.setItem('dlovs_token', (data as { token: string }).token);
    localStorage.setItem('dlovs_user', JSON.stringify((data as { user: DlovsUser }).user));
    setUser((data as { user: DlovsUser }).user);
    return (data as { user: DlovsUser }).user;
  }

  function logout(): void {
    localStorage.removeItem('dlovs_token');
    localStorage.removeItem('dlovs_user');
    setUser(null);
  }

  function updateUser(changes: Partial<DlovsUser>): void {
    const next = { ...user, ...changes } as DlovsUser;
    localStorage.setItem('dlovs_user', JSON.stringify(next));
    setUser(next);
  }

  const isStaff = Boolean(user && STAFF_ROLES.includes(user.role));
  return (
    <AuthContext.Provider value={{ user, isStaff, login, logout, updateUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function homePath(user: DlovsUser | null): string {
  if (!user) return '/verify';
  return STAFF_ROLES.includes(user.role) ? '/dashboard' : '/my';
}
