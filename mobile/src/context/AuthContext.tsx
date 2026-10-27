import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setAuthToken } from '../api/client';
import { getPushToken } from '../utils/push';
import type { RegisteredUser, User } from '../types';

const TOKEN_KEY = 'dlovs_token';
const USER_KEY = 'dlovs_user';


interface AuthContextValue {
  user: User | null;
  ready: boolean;
  login: (phone_number: string, password: string) => Promise<User>;
  register: (args: { full_name: string; phone_number: string; password: string; national_id?: string }) => Promise<RegisteredUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User>;
}

const storage = Platform.OS === 'web'
  ? {
      get: (k: string) => AsyncStorage.getItem(k),
      set: (k: string, v: string) => AsyncStorage.setItem(k, v),
      remove: (k: string) => AsyncStorage.removeItem(k),
    }
  : {
      get: (k: string) => SecureStore.getItemAsync(k),
      set: (k: string, v: string) => SecureStore.setItemAsync(k, v),
      remove: (k: string) => SecureStore.deleteItemAsync(k),
    };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const pushToken = useRef<string | null>(null);

  const enablePush = useCallback(async () => {
    const token = await getPushToken();
    if (!token) return;
    try {
      await api.post('/push-tokens', { token });
      pushToken.current = token;
    } catch {
      // offline or server error: try again on next login
    }
  }, []);

  const saveUser = useCallback(async (next: User) => {
    setUser(next);
    await storage.set(USER_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [token, storedUser] = await Promise.all([storage.get(TOKEN_KEY), storage.get(USER_KEY)]);
        if (token && storedUser) {
          setAuthToken(token);
          setUser(JSON.parse(storedUser) as User);
          enablePush();
        }
      } catch {
        // corrupted storage: start logged out
      } finally {
        setReady(true);
      }
    })();
  }, [enablePush]);

  const login = useCallback(async (phone_number: string, password: string): Promise<User> => {
    const data = await api.post<{ token: string; user: User }>('/auth/login', { phone_number, password });
    setAuthToken(data.token);
    await storage.set(TOKEN_KEY, data.token);
    await saveUser(data.user);
    enablePush();
    return data.user;
  }, [saveUser, enablePush]);

  const register = useCallback(
    ({ full_name, phone_number, password, national_id }: { full_name: string; phone_number: string; password: string; national_id?: string }) =>
      api.post<RegisteredUser>('/auth/register', { full_name, phone_number, password, national_id, platform: 'mobile' }),
    []
  );

  const refreshUser = useCallback(async (): Promise<User> => {
    const fresh = await api.get<User>('/auth/me');
    await saveUser(fresh);
    return fresh;
  }, [saveUser]);

  const logout = useCallback(async () => {
    if (pushToken.current) {
      api.delete('/push-tokens', { token: pushToken.current }).catch(() => {});
      pushToken.current = null;
    }
    setAuthToken(null);
    setUser(null);
    await Promise.all([storage.remove(TOKEN_KEY), storage.remove(USER_KEY)]);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
