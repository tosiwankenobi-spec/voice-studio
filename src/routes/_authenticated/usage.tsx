import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Progress } from "@/components/ui/progress";
import { useMonthUsage } from "@/hooks/useMonthUsage";
import { FREE_PREVIEWS_PER_DAY, PRICES, WARN_AT } from "@/lib/costs";
import type { UsageKind } from "@/lib/usage";

export const Route = createFileRoute("/_authenticated/usage")({
  head: () => ({
    meta: [
      { title: "Usage — Vocalis" },
      { name: "description", content: "See this month's credits by tool and by day." },
      { property: "og:title", content: "Usage — Vocalis" },
      { property: "og:description", content: "See this month's credits by tool and by day." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Usage,
});

function Usage() {
  const { summary, allowance, share, isLoading, error } = useMonthUsage();
  const now = new Date();
  const days = Array.from({ length: now.getDate() }, (_, i) => {
    const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    return { day: String(i + 1), credits: summary?.byDay.get(d) ?? 0 };
  });
  const kinds = summary
    ? [...summary.byKind.entries()].sort((a, b) => b[1].credits - a[1].credits)
    : [];
  return (
    <div className="min-h-screen bg-background bg-glow font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-16">
        <h1 className="font-display text-4xl font-bold">
          Usage &amp; <span className="text-primary">credits</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          Every tool shows its cost before you generate. Here's what you've used in{" "}
          {now.toLocaleString(undefined, { month: "long" })}.
        </p>
        {isLoading && <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" />}
        {error && <p className="mt-8 text-destructive">{(error as Error).message}</p>}
        {summary && (
          <>
            <section className="mt-6 rounded-2xl border bg-card p-6">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">This month</p>
                  <p className="font-display text-4xl font-bold">
                    {summary.total.toLocaleString()}{" "}
                    <span className="text-lg text-muted-foreground">
                      / {allowance.toLocaleString()} credits
                    </span>
                  </p>
                </div>
                <p
                  className={`text-sm ${share >= WARN_AT ? "text-primary" : "text-muted-foreground"}`}
                >
                  {Math.round(share * 100)}% used
                </p>
              </div>
              <Progress
                value={Math.min(100, share * 100)}
                className="mt-4"
                aria-label="Credits used this month"
              />
              <p className="mt-3 text-xs text-muted-foreground">
                First-sentence previews are free (up to {FREE_PREVIEWS_PER_DAY} a day). Resets on
                the 1st.
              </p>
            </section>
            <section className="mt-6 rounded-2xl border bg-card p-6">
              <h2 className="font-display text-lg font-bold">Credits per day</h2>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={days}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      stroke="var(--color-muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="var(--color-muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      allowDecimals={false}
                      width={36}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--color-muted)" }}
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                      }}
                      labelFormatter={(d) => `Day ${d}`}
                    />
                    <Bar dataKey="credits" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="mt-6 rounded-2xl border bg-card p-6">
              <h2 className="font-display text-lg font-bold">By tool</h2>
              {kinds.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nothing yet this month.</p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2">Tool</th>
                      <th>Uses</th>
                      <th>Amount</th>
                      <th className="text-right">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kinds.map(([kind, k]) => {
                      const p = PRICES[kind as UsageKind];
                      return (
                        <tr key={kind} className="border-t">
                          <td className="py-2">{p?.label ?? kind}</td>
                          <td>{k.count}</td>
                          <td className="text-muted-foreground">
                            {k.units.toLocaleString()} {p?.unit ?? ""}
                          </td>
                          <td className="text-right font-semibold">{k.credits.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
