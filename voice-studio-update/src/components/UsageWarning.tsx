import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useMonthUsage } from "@/hooks/useMonthUsage";
import { WARN_AT } from "@/lib/costs";

/** Banner shown once a user has used 80% of the month's credits. */
export function UsageWarning() {
  const { summary, allowance, share } = useMonthUsage();
  if (!summary || share < WARN_AT) return null;
  const over = share >= 1;
  return (
    <div
      role="status"
      className={`mx-auto mb-4 flex max-w-6xl items-center gap-2 rounded-xl border px-4 py-2 text-sm ${over ? "border-destructive text-destructive" : "border-primary/50 text-primary"}`}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {over
          ? "You've used this month's"
          : `You've used ${Math.round(share * 100)}% of this month's`}{" "}
        {allowance.toLocaleString()} credits.{" "}
        <Link to="/usage" className="underline">
          See usage
        </Link>
      </span>
    </div>
  );
}
