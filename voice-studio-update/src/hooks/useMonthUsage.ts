import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MONTHLY_ALLOWANCE, monthStart, summarizeUsage, type UsageRow } from "@/lib/costs";
import { useAuth } from "@/hooks/useAuth";

async function loadMonth(): Promise<UsageRow[]> {
  const rows: UsageRow[] = [];
  const since = monthStart().toISOString();
  // Page through the month in chunks of 1000 (PostgREST's default cap).
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("usage_events")
      .select("kind, units, created_at")
      .gte("created_at", since)
      .order("created_at")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

/** This calendar month's usage for the signed-in user, summarised in credits. */
export function useMonthUsage() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["usage", "month"],
    queryFn: loadMonth,
    enabled: !!user,
    staleTime: 60_000,
  });
  const summary = q.data ? summarizeUsage(q.data) : null;
  return {
    ...q,
    summary,
    allowance: MONTHLY_ALLOWANCE,
    share: summary ? summary.total / MONTHLY_ALLOWANCE : 0,
  };
}
