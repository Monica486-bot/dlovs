import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);
export const STAFF_ROLES = ['land_officer', 'administrator'];

function storedUser() {
  try {
    const stored = localStorage.getItem('dlovs_user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(storedUser);

  // Refresh the saved profile once per page load, so changes made by an
  // officer (e.g. confirming the national ID) show without logging in again.
  useEffect(() => {
    if (!localStorage.getItem('dlovs_token')) return;
    api.get('/auth/me')
      .then(({ data }) => {
        localStorage.setItem('dlovs_user', JSON.stringify(data));
        setUser(data);
      })
      .catch(() => {});
  }, []);

  // Resolves to the user. Rejects with the API error; a citizen whose phone
  // isn't confirmed yet gets error.response.data.code === 'PHONE_NOT_VERIFIED'.
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

  function updateUser(changes) {
    const next = { ...user, ...changes };
    localStorage.setItem('dlovs_user', JSON.stringify(next));
    setUser(next);
  }

  const isStaff = Boolean(user && STAFF_ROLES.includes(user.role));
  return (
    <AuthContext.Provider value={{ user, isStaff, login, logout, updateUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Where each kind of user lands after logging in
export function homePath(user) {
  if (!user) return '/verify';
  return STAFF_ROLES.includes(user.role) ? '/dashboard' : '/my';
}
