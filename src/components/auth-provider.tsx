"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

type AuthValue = { user: User | null; loading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> };
type AuthResponse = { user: User | null };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setUser((await api<AuthResponse>("/auth/me/")).user); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void api<AuthResponse>("/auth/me/")
      .then((response) => { if (active) setUser(response.user); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const signOut = async () => { await api("/auth/logout/", { method: "POST" }); setUser(null); window.location.href = "/login"; };
  return <AuthContext.Provider value={{ user, loading, refresh, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
