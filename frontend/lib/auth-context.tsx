"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { api, UserProfile } from "./api";

const TOKEN_KEY = "anibinge_token";

interface AuthContextValue {
  token: string | null;
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      setToken(stored);
      api.getMe(stored).then(setUser).catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await api.login(email, password);
    localStorage.setItem(TOKEN_KEY, access_token);
    setToken(access_token);
    try {
      const profile = await api.getMe(access_token);
      setUser(profile);
    } catch { /* token valid but profile fetch failed */ }
  }, []);

  const register = useCallback(async (email: string, username: string, password: string) => {
    const { access_token } = await api.register(email, username, password);
    localStorage.setItem(TOKEN_KEY, access_token);
    setToken(access_token);
    try {
      const profile = await api.getMe(access_token);
      setUser(profile);
    } catch { /* token valid but profile fetch failed */ }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
