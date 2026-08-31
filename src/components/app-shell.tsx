"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { BadgeCheck, Banknote, BookOpen, Brain, ChartNoAxesCombined, ClipboardCheck, LayoutDashboard, LogOut, Search, UserRound, Users } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "./auth-provider";

const nav = [
  ["/dashboard", "Dashboard", LayoutDashboard, "all"],
  ["/courses", "Courses", BookOpen, "all"],
  ["/quizzes", "Quizzes", ClipboardCheck, "all"],
  ["/search", "Search", Search, "all"],
  ["/progress", "Student Progress", ChartNoAxesCombined, "all"],
  ["/learning-path", "AI Learning Path", Brain, "student-admin"],
  ["/payments", "Payments", Banknote, "student-admin"],
  ["/certificates", "Certificates", BadgeCheck, "student"],
  ["/instructor-applications", "Instructor Applications", Users, "admin"],
  ["/users", "User Management", Users, "admin"],
  ["/ai-settings", "AI Settings", Brain, "admin"],
  ["/profile", "Profile", UserRound, "all"],
] as const;

function normalizePath(path: string) {
  return path === "/" ? path : path.replace(/\/+$/, "");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [loading, user, router, pathname]);
  useEffect(() => { if (!loading && user?.must_change_password && pathname !== "/change-password") router.replace("/change-password"); }, [loading, user, router, pathname]);
  if (loading || !user) return <main className="min-h-screen grid place-items-center">Loading PyLearn…</main>;
  const visible = nav.filter(([, , , scope]) => scope === "all" || (scope === "admin" && user.role === "ADMIN") || (scope === "student" && user.role === "STUDENT") || (scope === "student-admin" && user.role !== "INSTRUCTOR"));
  const currentPath = normalizePath(pathname);
  return <div className="min-h-screen lg:flex">
    <aside className="app-sidebar lg:w-64 lg:min-h-screen p-4">
      <Link href="/dashboard" className="flex items-center px-2 py-3" aria-label="PyLearn dashboard"><BrandLogo /></Link>
      <nav className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1">
        {visible.map(([href, label, Icon]) => {
          const active = currentPath === href || currentPath.startsWith(`${href}/`);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${active ? "nav-link-active" : "nav-link-inactive"}`}><Icon size={17} />{label}</Link>;
        })}
      </nav>
    </aside>
    <div className="flex-1 min-w-0">
      <header className="app-header h-16 border-b px-5 flex items-center justify-between"><div className="flex items-center gap-2">{user.avatar ? <img src={user.avatar} alt="" className="h-9 w-9 rounded-full object-cover" /> : null}<strong>{user.name}</strong><span className="badge ml-1">{user.role}</span></div><div className="flex items-center gap-2"><ThemeToggle /><button className="btn btn-secondary" onClick={() => void signOut()}><LogOut size={16} />Sign out</button></div></header>
      <main className="p-4 md:p-7 space-y-6 max-w-7xl mx-auto">{children}</main>
    </div>
  </div>;
}
