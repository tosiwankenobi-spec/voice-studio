- [x] Require authenticated access on all AI spending endpoints and show sign-in prompts.
- [ ] Add talking-avatar creation, narration preview and video download.
- [ ] Add browser-only pause/filler cleanup, noise reduction, loudness presets, A/B preview and undo.
- [ ] Add private pronunciation dictionary, server-side TTS replacement and script suggestions.
- [ ] Verify new workflows and run regression tests.
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