- [x] Require authenticated access on all AI spending endpoints and show sign-in prompts.
- [x] Require voice-copying consent and save clones durably, cleaning up failed saves.
- [x] Match Recording Editor download extensions to audio format.
- [x] Run security regression tests (26 passed) and verify signed-out blocking, consent controls, authenticated images, stock re-speaking and saved clip readback.

Verification limits: live ElevenLabs cloning and MP3 generation were not exercised; registration, cleanup and MPEG filename behavior passed mocked regression tests. Existing orphaned ElevenLabs voices were not deleted. Transcription completion was not confirmed during the timed browser check.

- [x] Update the shared signed-out prompt to "Sign in to start creating".
- [ ] Add usage rows, own-row access policies, and the user/date index.
- [ ] Enforce the approved 60-call/10-minute limit and record kind/units before paid requests.
- [ ] Run regression tests and verify authenticated usage recording and blocked requests.