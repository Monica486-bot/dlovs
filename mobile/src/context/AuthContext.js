import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setAuthToken } from '../api/client';
import { getPushToken } from '../utils/push';

const TOKEN_KEY = 'dlovs_token';
const USER_KEY = 'dlovs_user';

// SecureStore keeps the token encrypted on the device; it doesn't exist in
// the browser preview, so fall back to AsyncStorage there.
const storage = Platform.OS === 'web'
  ? {
      get: (k) => AsyncStorage.getItem(k),
      set: (k, v) => AsyncStorage.setItem(k, v),
      remove: (k) => AsyncStorage.removeItem(k),
    }
  : {
      get: (k) => SecureStore.getItemAsync(k),
      set: (k, v) => SecureStore.setItemAsync(k, v),
      remove: (k) => SecureStore.deleteItemAsync(k),
    };

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const pushToken = useRef(null);

  // FR15: tell the API where to push this account's notifications. Best
  // effort. The app works the same without push.
  const enablePush = useCallback(async () => {
    const token = await getPushToken();
    if (!token) return;
    try {
      await api.post('/push-tokens', { token });
      pushToken.current = token;
    } catch (err) {
      // offline or server error: try again on the next login or app start
    }
  }, []);

  const saveUser = useCallback(async (next) => {
    setUser(next);
    await storage.set(USER_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [token, storedUser] = await Promise.all([storage.get(TOKEN_KEY), storage.get(USER_KEY)]);
        if (token && storedUser) {
          setAuthToken(token);
          setUser(JSON.parse(storedUser));
          enablePush();
        }
      } catch (err) {
        // corrupted storage: start logged out
      } finally {
        setReady(true);
      }
    })();
  }, [enablePush]);

  const login = useCallback(async (phone_number, password) => {
    const data = await api.post('/auth/login', { phone_number, password });
    setAuthToken(data.token);
    await storage.set(TOKEN_KEY, data.token);
    await saveUser(data.user);
    enablePush();
    return data.user;
  }, [saveUser, enablePush]);

  // FR01: registering sends an SMS code; the account can't log in until the
  // phone number is confirmed (see app/verify-phone.js). Resolves to the
  // server's reply, which includes dev_code when no SMS provider is set up.
  const register = useCallback(
    ({ full_name, phone_number, password, national_id }) =>
      api.post('/auth/register', { full_name, phone_number, password, national_id, platform: 'mobile' }),
    []
  );

  // Reload the profile, e.g. after adding a national ID or an officer's ID check
  const refreshUser = useCallback(async () => {
    const fresh = await api.get('/auth/me');
    await saveUser(fresh);
    return fresh;
  }, [saveUser]);

  const logout = useCallback(async () => {
    // stop this phone receiving the account's alerts; the request picks up the
    // auth token synchronously, before it is cleared below
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

export function useAuth() {
  return useContext(AuthContext);
}
