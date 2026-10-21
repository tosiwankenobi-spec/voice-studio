// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  uploads: [] as string[],
  removed: [] as string[],
  row: null as unknown,
  fail: false,
  uploadFailsAt: 0,
  signed: [] as string[],
  previous: [] as unknown[],
  cleanupFails: false,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          if (state.uploadFailsAt === state.uploads.length + 1)
            return { error: new Error("Upload failed") };
          state.uploads.push(path);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          if (state.cleanupFails) throw new Error("Cleanup failed");
          state.removed.push(...paths);
          return { error: null };
        },
        createSignedUrl: async (path: string) => {
          state.signed.push(path);
          return {
            data: { signedUrl: "https://signed.example/" + path + "?fresh=true" },
            error: null,
          };
        },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { scenes: state.previous }, error: null }),
        }),
      }),
      insert: (row: unknown) => {
        state.row = row;
        return {
          select: () => ({
            single: async () => ({
              data: { id: "project-id" },
              error: state.fail ? new Error("Save failed") : null,
            }),
          }),
        };
      },
      update: (row: unknown) => {
        state.row = row;
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({
                data: { id: "project-id" },
                error: state.fail ? new Error("Save failed") : null,
              }),
            }),
          }),
        };
      },
    }),
  },
}));
import { saveAdProject, restoreAdScenes, type AdProjectScene } from "./ad-project";
const scene: AdProjectScene = {
  id: "scene-id",
  narration: "Buy it today.",
  image: null,
  imagePrompt: "Product",
  motion: "push in",
  seconds: 2.5,
  audio: "data:audio/wav;base64,UklGRg==",
  aiImage: "data:image/png;base64,cGlj",
};
const input = () => ({
  userId: "owner",
  id: null,
  sourceUrl: "https://example.com/product",
  product: { title: "Product" },
  settings: { voice: "Kore" },
  scenes: [{ ...scene }],
});
beforeEach(() => {
  state.uploads = [];
  state.removed = [];
  state.row = null;
  state.fail = false;
  state.uploadFailsAt = 0;
  state.signed = [];
  state.previous = [];
  state.cleanupFails = false;
});
it("round trips narration, duration and generated assets without saving temporary URLs", async () => {
  const saved = await saveAdProject(input());
  expect(state.uploads).toHaveLength(2);
  expect(JSON.stringify(state.row)).not.toContain("data:");
  const restored = await restoreAdScenes(JSON.parse(JSON.stringify(saved.scenes)), "owner");
  expect(restored[0]).toMatchObject({
    narration: scene.narration,
    seconds: 2.5,
    audioPath: saved.scenes[0]!.audioPath,
    aiImagePath: saved.scenes[0]!.aiImagePath,
  });
  expect(restored[0]!.audio).toContain("?fresh=true");
  expect(restored[0]!.aiImage).toContain("?fresh=true");
});
it("reuses saved assets on subsequent saves instead of uploading again", async () => {
  const saved = await saveAdProject(input());
  await saveAdProject({ ...input(), id: saved.id, scenes: [{ ...scene, ...saved.scenes[0] }] });
  expect(state.uploads).toHaveLength(2);
});
it("removes new uploads when saving the database row fails", async () => {
  state.fail = true;
  await expect(saveAdProject(input())).rejects.toThrow("Save failed");
  expect(state.removed).toEqual(state.uploads);
});
it("rolls back an earlier asset when a later upload fails", async () => {
  state.uploadFailsAt = 2;
  await expect(saveAdProject(input())).rejects.toThrow("Upload failed");
  expect(state.removed).toEqual(state.uploads);
});
it("does not delete previously saved assets when a later save fails", async () => {
  const saved = await saveAdProject(input());
  state.fail = true;
  await expect(
    saveAdProject({ ...input(), id: saved.id, scenes: [{ ...scene, ...saved.scenes[0] }] }),
  ).rejects.toThrow();
  expect(state.removed).toEqual([]);
});
it("opens legacy text-only projects", async () => {
  const { audio, aiImage, seconds, id, ...legacy } = scene;
  expect(await restoreAdScenes([legacy], "owner")).toMatchObject([{ narration: scene.narration }]);
  expect(state.signed).toEqual([]);
});
it("refuses stored paths belonging to a different user", async () => {
  await expect(
    restoreAdScenes([{ ...scene, audioPath: "other/ads/file.wav" }], "owner"),
  ).rejects.toThrow("Invalid saved ad asset");
  expect(state.signed).toEqual([]);
});

it("deletes only superseded owned assets after a successful update", async () => {
  state.previous = [
    { audioPath: "owner/ads/old.wav", aiImagePath: "owner/ads/keep.png" },
    { audioPath: "other/ads/no.wav" },
  ];
  await saveAdProject({
    ...input(),
    id: "project-id",
    scenes: [{ ...scene, aiImagePath: "owner/ads/keep.png" }],
  });
  expect(state.removed).toEqual(["owner/ads/old.wav"]);
});
it("keeps prior assets if the database update fails", async () => {
  state.previous = [{ audioPath: "owner/ads/old.wav" }];
  state.fail = true;
  await expect(saveAdProject({ ...input(), id: "project-id" })).rejects.toThrow("Save failed");
  expect(state.removed).toEqual(state.uploads);
  expect(state.removed).not.toContain("owner/ads/old.wav");
});
it("preserves committed uploads if old-asset cleanup fails", async () => {
  state.previous = [{ audioPath: "owner/ads/old.wav" }];
  state.cleanupFails = true;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const saved = await saveAdProject({ ...input(), id: "project-id" });
    expect(saved.scenes[0]!.audioPath).toBe(state.uploads[0]);
    expect(state.removed).toEqual([]);
  } finally {
    warn.mockRestore();
  }
});
