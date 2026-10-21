import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { applyPronunciations } from "./pronunciation";
export async function spokenPronunciation(
  supabase: SupabaseClient<Database>,
  userId: string,
  text: string,
) {
  const { data, error } = await supabase
    .from("pronunciations")
    .select("term, say_as")
    .eq("user_id", userId);
  if (error) throw new Error("Could not load your pronunciations. Please try again.");
  const spoken = applyPronunciations(text, data ?? []);
  if (spoken.length > 5000)
    throw new Error("Pronunciations made this passage too long. Split it into shorter lines.");
  return spoken;
}
