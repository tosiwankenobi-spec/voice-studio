import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t px-6 py-6 text-xs text-muted-foreground">
      <span>© {new Date().getFullYear()} Vocalis · Verolane Digital Solutions</span>
      <nav className="flex gap-4">
        <Link to="/responsible-use" className="hover:text-foreground">
          Responsible use
        </Link>
        <Link to="/usage" className="hover:text-foreground">
          Usage &amp; credits
        </Link>
      </nav>
    </footer>
  );
}
