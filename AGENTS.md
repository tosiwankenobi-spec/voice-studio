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
