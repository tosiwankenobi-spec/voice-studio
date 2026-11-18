import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  Clapperboard,
  Home,
  Image,
  Languages,
  Library,
  LogOut,
  Megaphone,
  Mic2,
  Palette,
  PencilLine,
  ScanFace,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMonthUsage } from "@/hooks/useMonthUsage";
import { UsageWarning } from "@/components/UsageWarning";
import { WARN_AT } from "@/lib/costs";

const CREATE = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/voice", label: "Voice Studio", icon: AudioLines },
  { to: "/dialogue", label: "Multi-voice", icon: Users },
  { to: "/editor", label: "Recording Editor", icon: PencilLine },
  { to: "/video", label: "Video Studio", icon: Clapperboard },
  { to: "/ad", label: "Product Ad", icon: Megaphone },
  { to: "/avatar", label: "Talking Avatar", icon: ScanFace },
  { to: "/images", label: "Image Studio", icon: Image },
] as const;
const LIBRARY = [
  { to: "/library", label: "My Library", icon: Library },
  { to: "/voices", label: "My Voices", icon: Mic2 },
  { to: "/pronunciations", label: "Pronunciations", icon: Languages, search: { term: "" } },
  { to: "/brand", label: "Brand Kit", icon: Palette },
] as const;

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label="Vocalis home">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <AudioLines className="h-5 w-5" />
      </span>
      <span className="font-display text-2xl font-extrabold tracking-tight">Vocalis</span>
    </Link>
  );
}

function CreditCard() {
  const { summary, allowance, share } = useMonthUsage();
  const used = Math.round(summary?.total ?? 0);
  return (
    <div
      className={`mx-4 rounded-2xl border bg-card p-4 ${share >= WARN_AT ? "border-primary" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Credits this month</span>
        <span className="font-mono text-foreground">
          {used.toLocaleString()} / {allowance.toLocaleString()}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, share * 100)}%` }}
        />
      </div>
      <Link to="/usage" className="mt-3 inline-block text-xs font-semibold text-muted-foreground hover:text-foreground">
        See usage
      </Link>
    </div>
  );
}

export function SiteHeader() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }
  const name = user?.email?.split("@")[0] ?? "Guest";
  const initials = name.slice(0, 2).toUpperCase();
  const linkClass =
    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";
  const active = { className: `${linkClass} bg-secondary text-primary` };
  return (
    <>
      <aside className="studio-rail fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-sidebar lg:flex">
        <div className="px-5 py-6"><Brand /></div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
          <p className="mb-2 px-3 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Create</p>
          <div className="space-y-1">
            {CREATE.map(({ to, label, icon: Icon, ...rest }) => (
              <Link key={to} to={to} className={linkClass} activeProps={active} activeOptions={{ exact: "exact" in rest }}>
                <Icon className="h-4 w-4 shrink-0" />{label}
              </Link>
            ))}
          </div>
          <p className="mb-2 mt-7 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Library</p>
          <div className="space-y-1">
            {LIBRARY.map(({ to, label, icon: Icon, ...rest }) => (
              <Link key={to} to={to} search={"search" in rest ? rest.search : true} className={linkClass} activeProps={active}>
                <Icon className="h-4 w-4 shrink-0" />{label}
              </Link>
            ))}
          </div>
        </nav>
        {user && <CreditCard />}
        <div className="mt-4 flex items-center gap-3 border-t px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary font-display text-xs font-bold text-primary">{initials}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold capitalize">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{user ? "Your workspace" : "Preview mode"}</p>
          </div>
          {ready && (user ? (
            <button onClick={signOut} aria-label="Sign out" title={user.email ?? ""} className="text-muted-foreground hover:text-foreground"><LogOut className="h-4 w-4" /></button>
          ) : (
            <Link to="/auth" className="text-xs font-semibold text-primary">Sign in</Link>
          ))}
        </div>
      </aside>
      <header className="border-b bg-sidebar px-5 py-4 lg:hidden">
        <div className="flex items-center justify-between"><Brand />{ready && (user ? <button onClick={signOut} aria-label="Sign out"><LogOut className="h-4 w-4" /></button> : <Link to="/auth" className="text-sm font-semibold text-primary">Sign in</Link>)}</div>
        <nav className="-mx-2 mt-4 flex max-w-full gap-1 overflow-x-auto whitespace-nowrap px-2 pb-1" aria-label="Main navigation">
          {[...CREATE, ...LIBRARY].map(({ to, label, ...rest }) => (
            <Link key={to} to={to} search={"search" in rest ? rest.search : true} className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground" activeProps={{ className: "rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-primary" }}>
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="lg:hidden"><UsageWarning /></div>
    </>
  );
}
