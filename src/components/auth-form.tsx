"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { BrandLogo } from "./brand-logo";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "./auth-provider";

export function AuthForm({ mode }: { mode: "login" | "register" | "forgot" }) {
  const router = useRouter();
  const { refresh } = useAuth();
  
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); 
    setBusy(true); 
    setError("");
    
    const values = Object.fromEntries(new FormData(event.currentTarget));
    
    try {
      if (mode === "forgot") { 
        await api("/auth/password-reset/", { method: "POST", body: jsonBody(values) }); 
        setDone(true); 
      } else { 
        await api(`/auth/${mode}/`, { method: "POST", body: jsonBody(values) }); 
        await refresh(); 
        router.push("/dashboard"); 
      }
    } catch (e) { 
      setError(e instanceof Error ? e.message : "Request failed"); 
    } finally { 
      setBusy(false); 
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-5 bg-[var(--background)] transition-colors duration-200">
      <section className="panel w-full max-w-md p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <BrandLogo />
            <h1 className="text-2xl font-bold mt-4 text-[var(--foreground)]">
              {mode === "login" 
                ? "Welcome back" 
                : mode === "register" 
                ? "Create student account" 
                : "Reset your password"}
            </h1>
          </div>
          <ThemeToggle />
        </div>
        
        {done ? (
          <div className="p-4 bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] border border-[color-mix(in_srgb,var(--primary)_40%,transparent)] rounded-lg text-[var(--primary-dark)] dark:text-[var(--primary)] text-sm font-semibold">
            If the account exists, reset instructions have been sent.
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            {mode === "register" && (
              <div className="grid grid-cols-2 gap-4">
                <input className="field" name="first_name" placeholder="First name" required />
                <input className="field" name="last_name" placeholder="Last name" required />
              </div>
            )}
            
            <input className="field" name="email" type="email" placeholder="Email" required />
            
            {mode !== "forgot" && (
              <input className="field" name="password" type="password" placeholder="Password" minLength={10} required />
            )}
            
            {mode === "register" && (
              <input className="field" name="department" placeholder="Department" />
            )}
            
            {error && <div className="error">{error}</div>}
            
            <div className="pt-2">
              <button className="btn btn-primary w-full text-base py-2.5" disabled={busy}>
                {busy 
                  ? "Please wait…" 
                  : mode === "login" 
                  ? "Sign in" 
                  : mode === "register" 
                  ? "Register" 
                  : "Send reset link"}
              </button>
            </div>
          </form>
        )}
        
        <div className="text-sm flex justify-between font-medium text-[var(--muted)] pt-2 border-t border-[var(--border)] mt-6">
          <Link 
            className="hover:text-[var(--primary)] transition-colors mt-4" 
            href={mode === "login" ? "/register" : "/login"}
          >
            {mode === "login" ? "Create account" : "Back to sign in"}
          </Link>
          
          {mode === "login" && (
            <Link 
              className="hover:text-[var(--primary)] transition-colors mt-4" 
              href="/forgot-password"
            >
              Forgot password?
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
