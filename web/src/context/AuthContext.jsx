import { createContext, useContext, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('dlovs_user');
    return stored ? JSON.parse(stored) : null;
  });

  async function login(phone_number, password) {
    const { data } = await api.post('/auth/login', { phone_number, password });
    localStorage.setItem('dlovs_token', data.token);
    localStorage.setItem('dlovs_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('dlovs_token');
    localStorage.removeItem('dlovs_user');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
