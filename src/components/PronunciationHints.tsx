import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { pronunciationSuggestions } from "@/lib/pronunciation";
export function PronunciationHints({ text }: { text: string }) {
  const { user } = useAuth();
  const entries = useQuery({
    queryKey: ["pronunciations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("pronunciations").select("term, say_as");
      if (error) throw error;
      return data ?? [];
    },
  });
  const terms = pronunciationSuggestions(text, entries.data ?? []);
  if (!user || !terms.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Add pronunciation?</span>
      {terms.map((term) => (
        <Link
          key={term}
          to="/pronunciations"
          search={{ term }}
          className="text-primary underline underline-offset-4"
        >
          {term}
        </Link>
      ))}
    </div>
  );
}
