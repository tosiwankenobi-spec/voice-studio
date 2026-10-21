import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AudioLines, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UsageWarning } from "@/components/UsageWarning";

export function SiteHeader() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const link = "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground";
  const active = { className: "rounded-md px-3 py-1.5 text-sm bg-secondary text-foreground" };

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  return (
    <>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <AudioLines className="h-7 w-7 text-primary" />
          <span className="font-display text-2xl font-extrabold tracking-tight">Vocalis</span>
        </Link>
        <nav className="-mx-2 flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap px-2 [&>*]:shrink-0">
          <Link to="/" className={link} activeProps={active} activeOptions={{ exact: true }}>
            Voice Studio
          </Link>
          <Link to="/editor" className={link} activeProps={active}>
            Recording Editor
          </Link>
          <Link to="/dialogue" className={link} activeProps={active}>
            Multi-voice
          </Link>
          <Link to="/video" className={link} activeProps={active}>
            Video Studio
          </Link>
          <Link to="/ad" className={link} activeProps={active}>
            Product Ad
          </Link>
          <Link to="/avatar" className={link} activeProps={active}>
            Talking Avatar
          </Link>
          <Link to="/images" className={link} activeProps={active}>
            Image Studio
          </Link>
          <Link to="/voices" className={link} activeProps={active}>
            My Voices
          </Link>
          <Link to="/pronunciations" search={{ term: "" }} className={link} activeProps={active}>
            Pronunciations
          </Link>
          <Link to="/brand" className={link} activeProps={active}>
            Brand Kit
          </Link>
          <Link to="/library" className={link} activeProps={active}>
            My Library
          </Link>
          <Link to="/usage" className={link} activeProps={active}>
            Usage
          </Link>
          {ready &&
            (user ? (
              <button
                onClick={signOut}
                className={link}
                aria-label="Sign out"
                title={user.email ?? ""}
              >
                <LogOut className="h-4 w-4" />
              </button>
            ) : (
              <Link to="/auth" className={link} activeProps={active}>
                Sign in
              </Link>
            ))}
        </nav>
      </header>
      {user && (
        <div className="px-6">
          <UsageWarning />
        </div>
      )}
    </>
  );
}
