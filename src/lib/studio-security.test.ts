import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ signedIn: false, registered: false, insertFails: false, ownsVoice: false, pronunciations: [] as { term: string; say_as: string }[] }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: "auth" }));
vi.mock("@/lib/usage", () => ({ recordAIUsage: vi.fn(), UsageLimitError: class extends Error {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => {
    let protectedFn = false;
    let validate = (data: unknown): unknown => data;
    const builder = {
      middleware: () => { protectedFn = true; return builder; },
      inputValidator: (fn: typeof validate) => { validate = fn; return builder; },
      handler: (fn: (args: unknown) => unknown) => async (opts: { data: unknown }) => {
        if (protectedFn && !state.signedIn) throw new Error("Unauthorized");
        const supabase = { from: (table: string) => table === 'pronunciations' ? { select: () => ({ eq: async () => ({ data: state.pronunciations, error: null }) }) } : ({
          insert: () => ({ select: () => ({ single: async () => {
            state.registered = !state.insertFails;
            return state.insertFails ? { error: new Error("Save failed"), data: null } : { data: { id: "saved-id" }, error: null };
          } }) }),
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.ownsVoice ? { id: 'owned' } : null, error: null }) }) }) }),
        }) };
        return fn({ data: validate(opts.data), context: { userId: "owner", supabase } });
      },
    };
    return builder;
  },
}));

import { askClaude, cloneMyVoice, generateSpeech, speakWithMyVoice, transcribeRecording } from "./studio.functions";
import { planScenes, startVideo } from "./media.functions";
import { recordAIUsage } from "./usage";
import { audioExtension } from "./studio-validation";
import { authenticateImageRequest } from "./image-auth.server";

beforeEach(() => {
  vi.mocked(recordAIUsage).mockReset();
  state.signedIn = false;
  state.registered = false;
  state.insertFails = false;
  state.ownsVoice = false;
  state.pronunciations = [];
  vi.stubEnv("ELEVENLABS_API_KEY", "test-only");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ voice_id: "testVoice12345" }), { status: 200 })));
});

describe("AI access", () => {
  const calls = [
    ["speech", () => generateSpeech({ data: { text: "Hello", voice: "Kore" } })],
    ["Claude", () => askClaude({ data: { text: "Hello", instruction: "Polish" } })],
    ["transcription", () => transcribeRecording({ data: new FormData() })],
    ["voice cloning", () => cloneMyVoice({ data: new FormData() })],
    ["cloned speech", () => speakWithMyVoice({ data: { text: "Hello", voiceId: "testVoice12345" } })],
    ["scene planning", () => planScenes({ data: { script: "Hello" } })],
  ] as const;
  for (const [name, call] of calls) it(`${name} rejects signed-out callers without spending credits`, async () => {
    await expect(call()).rejects.toThrow("Unauthorized");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("image requests require a bearer session", async () => {
    expect(await authenticateImageRequest(new Request("https://example.test/api/generate-image"))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cloned speech rejects a voice not owned by the caller", async () => {
    state.signedIn = true;
    await expect(speakWithMyVoice({ data: { text: "Hello", voiceId: "testVoice12345" } })).rejects.toThrow("saved voices");
    expect(fetch).not.toHaveBeenCalled();
  });
});

function recording(consent?: string) {
  const form = new FormData();
  form.append("file", new File(["recorded speech"], "voice.wav", { type: "audio/wav" }));
  if (consent) form.append("consent", consent);
  return form;
}

describe("Voice permission and registration", () => {
  it("rejects cloning without explicit permission", async () => {
    state.signedIn = true;
    await expect(cloneMyVoice({ data: recording() })).rejects.toThrow("permission");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("saves an authenticated consented clone before returning its ID", async () => {
    state.signedIn = true;
    expect(await cloneMyVoice({ data: recording("true") })).toEqual({ id: "saved-id", voiceId: "testVoice12345" });
    expect(state.registered).toBe(true);
  });
  it("deletes the provider clone if saving fails", async () => {
    state.signedIn = true;
    state.insertFails = true;
    await expect(cloneMyVoice({ data: recording("true") })).rejects.toThrow("Couldn't save");
    expect(fetch).toHaveBeenLastCalledWith("https://api.elevenlabs.io/v1/voices/testVoice12345", expect.objectContaining({ method: "DELETE" }));
  });
});

describe("Audio filenames", () => {
  it("names ElevenLabs MPEG audio mp3", () => expect(audioExtension("audio/mpeg")).toBe("mp3"));
  it("keeps WAV exports wav", () => expect(audioExtension("audio/wav")).toBe("wav"));
});

describe("Paid call usage gates", () => {
  const calls = [
    ["speech", () => generateSpeech({ data: { text: "Hello", voice: "Kore" } })],
    ["Claude", () => askClaude({ data: { text: "Hello", instruction: "Polish" } })],
    ["transcription", () => transcribeRecording({ data: recording() })],
    ["voice cloning", () => cloneMyVoice({ data: recording("true") })],
    ["scene planning", () => planScenes({ data: { script: "Hello" } })],
    ["video", () => startVideo({ data: { prompt: "A waving hand", seconds: 8 } })],
  ] as const;
  for (const [name, call] of calls) it(`${name} stops before the provider when usage is blocked`, async () => {
    state.signedIn = true;
    vi.mocked(recordAIUsage).mockRejectedValueOnce(new Error("60 AI calls in 10 minutes"));
    await expect(call()).rejects.toThrow("60 AI calls");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Take generation', () => {
  it('applies private pronunciations to stock speech and keeps input text unchanged', async () => {
    state.signedIn = true; state.pronunciations = [{ term: 'Vocalis', say_as: 'voh cal iss' }];
    vi.stubEnv('LOVABLE_API_KEY', 'test-only');
    const data = { text: 'Welcome to Vocalis', voice: 'Kore' };
    await generateSpeech({ data });
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).contents[0].parts[0].text).toBe('Welcome to voh cal iss');
    expect(data.text).toBe('Welcome to Vocalis');
  });
  it('applies pronunciations to owned cloned speech', async () => {
    state.signedIn = true; state.ownsVoice = true; state.pronunciations = [{ term: 'Vocalis', say_as: 'voh cal iss' }];
    await speakWithMyVoice({ data: { text: 'Vocalis', voiceId: 'testVoice12345' } });
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).text).toBe('voh cal iss');
  });
  it('sends saved-voice take speed, stress and break settings and reserves its usage', async () => {
    state.signedIn = true; state.ownsVoice = true;
    await speakWithMyVoice({ data: { text: 'Hello friend.', voiceId: 'testVoice12345', delivery: { pace: 'faster', emphasis: 'friend', pause: 0.5 } } });
    const request = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(request?.[1]?.body));
    expect(body.text).toBe('Hello FRIEND.<break time="0.5s"/>');
    expect(body.voice_settings.speed).toBe(1.15);
    expect(recordAIUsage).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner' }), 'cloned_tts', 13);
  });
  it('reserves usage for every generated stock take with delivery controls', async () => {
    state.signedIn = true;
    vi.stubEnv('LOVABLE_API_KEY', 'test-only');
    await generateSpeech({ data: { text: 'Hello friend', voice: 'Kore', delivery: { pace: 'slower', emphasis: 'friend', pause: 0.5 } } });
    expect(recordAIUsage).toHaveBeenCalledTimes(1);
    expect(recordAIUsage).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner' }), 'tts', expect.any(Number));
    const call = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(call?.[1]?.body)).contents[0].parts[0].text).toContain('stressing the word "friend"');
  });
  it('rejects unsupported pauses before spending', async () => {
    state.signedIn = true;
    await expect(generateSpeech({ data: { text: 'Hello', voice: 'Kore', delivery: { pause: 0.75 } } })).rejects.toThrow('pause');
    expect(recordAIUsage).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
});