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
