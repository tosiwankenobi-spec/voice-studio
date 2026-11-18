import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, AudioLines, Clapperboard, Megaphone, Mic2, Play, Plus, ScanFace, Search, Users } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { AISignIn } from "@/components/AISignIn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WaveMark } from "@/components/WaveMark";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — Vocalis" },
      { name: "description", content: "Create polished voiceovers, recordings and narrated videos from one studio." },
      { property: "og:title", content: "Home — Vocalis" },
      { property: "og:description", content: "Your AI audio and video creation workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const STUDIOS = [
  { to: "/voice", title: "Voice Studio", description: "Write or paste a script, pick a voice, refine line by line.", icon: AudioLines, color: "text-primary" },
  { to: "/editor", title: "Recording Editor", description: "Edit audio by editing the transcript. Patch words in your own voice.", icon: Mic2, color: "text-accent" },
  { to: "/ad", title: "Product Ad", description: "Paste a product link and get a captioned vertical ad.", icon: Megaphone, color: "text-primary" },
  { to: "/dialogue", title: "Multi-voice", description: "Podcasts and dialogues with a different voice for every speaker.", icon: Users, color: "text-foreground" },
  { to: "/video", title: "Video Studio", description: "Turn a script into narrated scenes with pictures and motion.", icon: Clapperboard, color: "text-foreground" },
  { to: "/avatar", title: "Talking Avatar", description: "Design an animated or photo face with speech-timed mouth shapes.", icon: ScanFace, color: "text-foreground" },
] as const;
const QUICK = [
  { label: "Podcast intro", idea: "A warm thirty-second podcast intro for a small business show" },
  { label: "Product ad from a link", idea: "", to: "/ad" },
  { label: "Clean up a recording", idea: "", to: "/editor" },
  { label: "Dub a video into French", idea: "", to: "/editor" },
] as const;

type Recent = { id: string; title: string; studio: string; date: string };
async function loadRecent(): Promise<Recent[]> {
  const [scripts, clips, media, ads] = await Promise.all([
    supabase.from("scripts").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(5),
    supabase.from("clips").select("id,text,voice,created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("media").select("id,prompt,kind,created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("ad_projects").select("id,product,updated_at").order("updated_at", { ascending: false }).limit(5),
  ]);
  for (const result of [scripts, clips, media, ads]) if (result.error) throw result.error;
  return [
    ...(scripts.data ?? []).map((x) => ({ id: `s-${x.id}`, title: x.title, studio: "Voice Studio", date: x.updated_at })),
    ...(clips.data ?? []).map((x) => ({ id: `c-${x.id}`, title: x.text.slice(0, 70) || "Voice clip", studio: x.voice, date: x.created_at })),
    ...(media.data ?? []).map((x) => ({ id: `m-${x.id}`, title: x.prompt || `Saved ${x.kind}`, studio: x.kind === "video" ? "Video" : "Image", date: x.created_at })),
    ...(ads.data ?? []).map((x) => ({ id: `a-${x.id}`, title: (x.product as { title?: string })?.title || "Product ad", studio: "Product Ad", date: x.updated_at })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
}

function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [idea, setIdea] = useState("");
  const [search, setSearch] = useState("");
  const [today, setToday] = useState({ date: "", greeting: "Welcome" });
  const recent = useQuery({ queryKey: ["home-recent"], queryFn: loadRecent, enabled: !!user });
  useEffect(() => {
    const now = new Date();
    const hour = now.getHours();
    setToday({
      date: new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(now),
      greeting: hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening",
    });
  }, []);
  const name = user?.email?.split("@")[0] ?? "creator";
  const create = () => navigate({ to: "/voice", search: idea.trim() ? { idea: idea.trim() } : {} });
  const filteredStudios = STUDIOS.filter((s) => `${s.title} ${s.description}`.toLowerCase().includes(search.toLowerCase()));
  const filteredRecent = (recent.data ?? []).filter((r) => `${r.title} ${r.studio}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="min-h-screen bg-background font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-[1440px] px-6 pb-16 pt-8 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm text-muted-foreground">{today.date || "Your creative workspace"}</p>
            <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight md:text-5xl">{today.greeting}, <span className="capitalize">{name}</span></h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative block w-72 max-w-full">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects, voices, clips" className="pl-9" aria-label="Search projects, voices, clips" />
            </label>
            <Button asChild size="lg"><Link to="/voice"><Plus className="h-4 w-4" />New project</Link></Button>
          </div>
        </div>
        <section className="relative mt-8 overflow-hidden rounded-2xl border bg-card p-6 md:p-8">
          <div className="relative z-10 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Start with an idea</p>
            <h2 className="mt-3 font-display text-3xl font-bold md:text-4xl">What are we making today?</h2>
            <p className="mt-3 text-muted-foreground">Start with an idea, then use Claude to draft your script and choose a voice.</p>
            <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); create(); }}>
              <Input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="A thirty-second ad for our new soy candle, warm and calm" aria-label="Project idea" className="h-12 flex-1 bg-background" />
              <Button size="lg" type="submit">Create</Button>
            </form>
            <div className="mt-5 flex flex-wrap gap-2">
              {QUICK.map((q) => "to" in q ? (
                <Button key={q.label} asChild variant="outline" size="sm" className="rounded-full"><Link to={q.to}>{q.label}</Link></Button>
              ) : (
                <Button key={q.label} variant="outline" size="sm" className="rounded-full" onClick={() => navigate({ to: "/voice", search: { idea: q.idea } })}>{q.label}</Button>
              ))}
            </div>
          </div>
          <WaveMark className="absolute -right-4 bottom-4 hidden h-56 text-primary/50 xl:flex" bars={24} />
        </section>
        {!user && <AISignIn />}
        <section className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-display text-2xl font-bold">Studios</h2>
            <p className="hidden text-sm text-muted-foreground md:block">Every tool shows its credit cost before you generate</p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {filteredStudios.map(({ to, title, description, icon: Icon, color }) => (
              <Link key={to} to={to} className="group rounded-2xl border bg-card p-4 transition-colors hover:border-primary">
                <div className="flex h-24 items-center justify-center rounded-xl bg-secondary px-4"><WaveMark className={`h-16 ${color}`} bars={18} /></div>
                <div className="mt-4 flex items-center gap-2"><Icon className={`h-4 w-4 ${color}`} /><h3 className="font-display text-lg font-bold">{title}</h3></div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </Link>
            ))}
          </div>
        </section>
        <section className="mt-10">
          <div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Recent work</h2><Link to="/library" className="flex items-center gap-1 text-sm font-semibold text-primary">Open library<ArrowRight className="h-4 w-4" /></Link></div>
          <div className="mt-4 overflow-hidden rounded-2xl border bg-card">
            {user && filteredRecent.map((item) => (
              <Link to="/library" key={item.id} className="flex items-center gap-4 border-b p-4 last:border-0 hover:bg-secondary">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><Play className="ml-0.5 h-4 w-4 fill-current" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.title}</span><span className="text-sm text-muted-foreground">{item.studio} · {new Date(item.date).toLocaleDateString()}</span></span>
                <WaveMark className="hidden h-8 text-muted-foreground md:flex" bars={18} />
              </Link>
            ))}
            {(!user || recent.isLoading || filteredRecent.length === 0) && (
              <div className="p-6 text-sm text-muted-foreground">{!user ? "Sign in to see your saved work here." : recent.isLoading ? "Loading your recent work…" : search ? "No work matches your search." : "Your next finished project will appear here."}</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
