import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/responsible-use")({
  head: () => ({
    meta: [
      { title: "Responsible Use — Vocalis" },
      {
        name: "description",
        content: "How Vocalis handles voice copying, consent and AI disclosure.",
      },
      { property: "og:title", content: "Responsible Use — Vocalis" },
      {
        property: "og:description",
        content: "How Vocalis handles voice copying, consent and AI disclosure.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResponsibleUse,
});

const RULES: { title: string; body: string }[] = [
  {
    title: "Only copy voices you have the right to use",
    body: "Copy your own voice, or the voice of someone who is with you and agrees. Before a voice is copied, the speaker reads a consent sentence aloud. We check the recording matches and keep it with the voice.",
  },
  {
    title: "No impersonation or deception",
    body: "Don't use Vocalis to put words in a real person's mouth without their permission, to pretend to be someone else, or to mislead people about who is speaking. That includes public figures.",
  },
  {
    title: "Say when a voice is AI",
    body: "Exports can carry an “AI-generated voice” label: a note inside WAV files and an on-screen label or end card on videos. Turn it on whenever your audience might assume they're hearing a real recording.",
  },
  {
    title: "You stay in control",
    body: "Deleting a voice in My Voices removes it from our provider (ElevenLabs), along with its sample and consent recording. Your scripts, clips and videos are private to your account.",
  },
  {
    title: "Respect other people's work",
    body: "Product Ad reads public product pages so you can advertise your own products. Only use photos and descriptions you have the right to use.",
  },
];

function ResponsibleUse() {
  return (
    <div className="min-h-screen bg-background bg-glow font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pb-16">
        <h1 className="font-display text-4xl font-bold">
          Responsible <span className="text-primary">use</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          Vocalis can copy voices and create realistic speech. These rules keep that safe for
          everyone.
        </p>
        <div className="mt-8 space-y-4">
          {RULES.map((r) => (
            <section key={r.title} className="rounded-2xl border bg-card p-5">
              <h2 className="font-display text-lg font-bold">{r.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
            </section>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Questions or a report of misuse? Contact Verolane Digital Solutions.{" "}
          <Link to="/voices" className="text-primary hover:underline">
            Manage your voices
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
