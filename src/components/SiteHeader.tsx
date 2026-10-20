import { Link } from "@tanstack/react-router";
import { AudioLines } from "lucide-react";

export function SiteHeader() {
  const link = "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground";
  const active = { className: "rounded-md px-3 py-1.5 text-sm bg-secondary text-foreground" };
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <Link to="/" className="flex items-center gap-2">
        <AudioLines className="h-7 w-7 text-primary" />
        <span className="font-display text-2xl font-extrabold tracking-tight">Vocalis</span>
      </Link>
      <nav className="flex gap-1">
        <Link to="/" className={link} activeProps={active} activeOptions={{ exact: true }}>
          Voice Studio
        </Link>
        <Link to="/editor" className={link} activeProps={active}>
          Recording Editor
        </Link>
      </nav>
    </header>
  );
}
