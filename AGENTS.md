<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Saved scripts/clips live in Lovable Cloud tables `scripts`/`clips` (RLS per user) and the private `clips` bucket under `<user_id>/`; the browser client writes them directly so RLS enforces ownership.
- AI calls (Claude, TTS, transcription, ElevenLabs) live in `src/lib/studio.functions.ts` server functions; keys never reach the browser.
- Editor word timings come from ElevenLabs Scribe when it has credits, otherwise a Gemini audio model; the timeline snaps cuts to the quietest point near each word gap because AI timings can drift by up to ~0.5s.
- Every AI spending server function uses requireSupabaseAuth; the streaming image route verifies a bearer session before calling the gateway, preventing anonymous credit use.
- Voice cloning checks explicit consent server-side and registers the clone using the authenticated RLS client before returning; failed registration attempts provider deletion so browser exits cannot create untracked voices.
- Cloned speech verifies ownership of the saved provider voice ID before spending credits; clients attach preview samples only after registration.
- Audio download extensions derive from the returned MIME type so filenames match the encoded content.
- Paid provider calls reserve usage through the shared server-only usage helper using the authenticated RLS client; fail closed on tracking errors, count attempts (including timing fallbacks), and exclude video polling/deletion because they do not start paid generation. This keeps a single limiter and avoids untracked spending.
- Usage units are integer estimates: TTS input characters, requested video seconds, browser-decoded transcription seconds (zero if absent from legacy callers), and one for text/image/clone requests; reservations are not actual provider bills.
- Patch DSP and LCS span mapping live in pure lib helpers; Timeline appends processed patch samples to its source buffer and stores segment/word snapshots, preserving source mappings and individually reversible replacements.
- Script takes are browser-written private Cloud rows and clips objects; delivery is validated by shared pure helpers and paid generation uses the existing authenticated speech functions, preserving the shared usage gate.
- Chosen-take export decodes and trims each take then joins with exact silence locally; a row-locking database trigger enforces take capacity and a partial unique index enforces one chosen take per line.
