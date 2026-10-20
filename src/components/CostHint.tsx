import { Coins } from "lucide-react";
import { costLabel, creditsFor } from "@/lib/costs";
import type { UsageKind } from "@/lib/usage";

/** "≈ N credits" shown next to a generate button, so nobody is surprised by what an action costs. */
export function CostHint({
  kind,
  units,
  times = 1,
  className = "",
}: {
  kind: UsageKind;
  units: number;
  times?: number;
  className?: string;
}) {
  const credits = creditsFor(kind, units) * times;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${className}`}
      title="Estimated cost before you generate"
    >
      <Coins className="h-3.5 w-3.5" aria-hidden /> {costLabel(credits)}
    </span>
  );
}
