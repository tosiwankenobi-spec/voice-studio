- [x] Add a hands-on animated face editor with independent shape/style controls, live lip-sync and matching video export.
- [x] Add an uploaded-portrait puppet mode with crop/style controls, adjustable lip-sync mouth placement and matching video export.
- [ ] Verify live ElevenLabs cloned speech — blocked until a consented cloned voice is saved; live ElevenLabs Scribe transcription is verified.

Face-editor verification: independent geometry and color controls visibly changed the animated face and persisted across reload; portrait upload, crop, style and mouth placement worked. Real uploaded narration produced nine timed words and 52 mouth shapes, preview cycled through seven distinct shapes, and both customized 1280×720 MP4 exports downloaded with audio. Desktop/mobile had no overflow or browser errors; all 154 tests and TypeScript passed.
- [x] Apply the uploaded violet/cyan redesign: left navigation, Home dashboard, Voice Studio, Recording Editor and Product Ad.

Redesign verification: all four screens checked signed-out at desktop and mobile sizes with no overflow or browser errors; signed-in Home showed recent work and monthly usage, idea creation populated Voice Studio, speech saved to My Library, and WAV export downloaded successfully. All 148 regression tests passed; TypeScript and the preview build passed.
- [x] Require authenticated access on all AI spending endpoints and show sign-in prompts.
- [x] Replace energy-only talking-avatar motion with phoneme/viseme lip-sync, preview and video export.

Talking-face verification: generated narration produced 21 timed mouth shapes for six words; preview visibly cycled through wide, open, closed, tongue-up, round, sibilant and tongue shapes, and the downloaded MP4 contained the animation and audio. Uploaded narration produced 117 mouth shapes from 31 timed words. Preview/export share the same binary-searched viseme timeline, with closed lips during silence and 35ms coarticulation blends. All 148 tests pass; TypeScript and the preview build are clean.
- [x] Add browser-only pause/filler cleanup, noise reduction, loudness presets, A/B preview and undo.
- [x] Add private pronunciation dictionary, server-side TTS replacement and script suggestions.
- [x] Verify new workflows and run regression tests.
- [x] Require voice-copying consent and save clones durably, cleaning up failed saves.
- [x] Match Recording Editor download extensions to audio format.
- [x] Run security regression tests (26 passed) and verify signed-out blocking, consent controls, authenticated images, stock re-speaking and saved clip readback.

Verification limits: live ElevenLabs cloning and MP3 generation were not exercised; registration, cleanup and MPEG filename behavior passed mocked regression tests. Existing orphaned ElevenLabs voices were not deleted. Transcription completion was not confirmed during the timed browser check.

- [x] Update the shared signed-out prompt to "Sign in to start creating".
- [x] Add usage rows, own-row access policies, and the user/date index.
- [x] Enforce the approved 60-call/10-minute limit and record kind/units before paid requests.
- [x] Run regression tests and verify authenticated usage recording and blocked requests.

Usage verification: authenticated stock speech recorded 50 TTS characters and saved its clip, visible in My Library. Limit boundary and provider blocking are covered by regression tests; live saturation with 60 requests was not performed. Duration units are estimates; zero represents unknown duration. Provider failures also count, and timing fallbacks reserve separate calls.

- [x] Add changed-word patches with context, matching, highlights and individual undo.
- [x] Add sentence takes, delivery controls, chosen-take export and saved-script persistence.
- [x] Test audio maths, limits and authenticated editor/studio workflows.

Verification: 61 tests passed. Real signed-in Gemini takes generated, persisted and reopened; pace/emphasis/0.5-second pause and selected take survived reload; a fourth take was disabled. Joined audio saved and read back in My Library. Real joined WAV uploaded and transcribed; a fresh-to-tasty patch generated, highlighted and exported; individual undo restored the original full transcript and audio duration. Mobile checks showed no horizontal overflow. Live ElevenLabs delivery remains unverified because the linked account has no credits; provider request settings are regression-tested. Patch word positions within generated phrases are estimated locally; edits remain session-local until exporting/saving audio.
## Built outside Lovable (Oct 20, 2026) — pushed via GitHub

- [x] Product Ad (`/ad`): reads Shopify `.js` product JSON, JSON-LD `Product`, or Open Graph tags through an SSRF-safe server fetch (http(s) only, DNS-over-HTTPS check rejects private/loopback/link-local/metadata IPs, every redirect re-checked, max 3 redirects, 10 s timeout, 3 MB page / 8 MB image cap). Manual entry + photo upload fallback. Claude writes 15/30/60 s ads (hook, benefits, price CTA) as scenes that reference product photos by index (≤2 AI lifestyle shots). Product photos go through `proxyImage` so canvases aren't tainted. Saves to `ad_projects`; finished videos save to My Library.
- [x] Export formats, captions, brand kit: 16:9 1920×1080, 9:16 1080×1920, 1:1 1080×1080 with blur-fill for mismatched pictures; burned-in captions (word-by-word highlight, two-line subtitles, big bold) from estimated word timings; `.srt` download; `/brand` brand kit (`brand_kits` table: logo, accent/card colours, font, intro/outro/CTA cards) applied on export; price badge; cancel export.
- [x] Multi-voice (`/dialogue`): `NAME:` / `[Name]` speaker tags, per-speaker stock or saved voice, per-line re-voice, joined WAV with natural gaps, save to library. Recording Editor shows diarized speaker turns (ElevenLabs Scribe `diarize=true`, Gemini fallback labels speakers) with per-turn playback.
- [x] Translate & dub: `translateLines` (Claude, line-for-line, length-aware). Video Studio translates every scene, then re-voice (saved voices now selectable). Recording Editor "Translate & dub" speaks the translation in the copied voice and regenerates once at a fitted speed (0.7–1.2) so it runs about as long as the original. 10 languages.
- [x] Cost transparency: `src/lib/costs.ts` holds every credit price and the monthly allowance (2,000). Cost hints next to generate buttons, `/usage` page (month total, per-day chart, per-tool table), 80% warning banner, free first-sentence previews (≤200 chars, 30/day, recorded as `tts_preview` with 0 credits but still rate-limited).
- [x] Spoken consent: copying a voice now requires the speaker to read a consent sentence; the server transcribes it and refuses to clone unless it matches (`consentMatches`), stores the recording at `<uid>/consent/` and sets `voices.consent_path` / `consented_at`. Deleting a voice deletes its consent recording.
- [x] AI disclosure: optional "AI-generated voice" on-screen label + outro line on videos, LIST/INFO comment in downloaded WAVs, `/responsible-use` page linked from the new footer.

Verification: 114 tests pass (product/SSRF, captions, costs, dialogue/dub, consent, AI tag, previews), `tsc` clean, production build OK, every page renders signed-out, and a real 9:16 branded export (intro card → captioned scene with price badge → outro) was recorded and checked frame by frame in Chromium. Not verified live: provider calls (no AI/ElevenLabs credits in this environment) and the new migrations, which still need applying.

**Needs Lovable:** apply migrations `0007_product_ads`, `0008_brand_kits`, `0009_voice_consent` to the Cloud database, and regenerate `src/integrations/supabase/types.ts` if it differs from the hand-edited version.
