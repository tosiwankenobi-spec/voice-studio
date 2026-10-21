// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ events: [] as string[], fail: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    storage: {
      from: () => ({
        upload: async () => {
          state.events.push("upload");
          return { error: null };
        },
        remove: async (paths: string[]) => {
          state.events.push(
            paths.some((p) => p === "owner/brand/old.png") ? "remove-old" : "remove-new",
          );
          return { error: null };
        },
      }),
    },
    from: () => ({
      upsert: async () => {
        state.events.push("save");
        return { error: state.fail ? new Error("Save failed") : null };
      },
    }),
  },
}));
import { DEFAULT_BRAND, saveBrand, removeLogo } from "./brand";
const kit = { ...DEFAULT_BRAND, logoPath: "owner/brand/old.png" };
beforeEach(() => {
  state.events = [];
  state.fail = false;
});
it("keeps the old logo and removes the upload when the row cannot be saved", async () => {
  state.fail = true;
  await expect(
    saveBrand(kit, new File(["image"], "new.png", { type: "image/png" })),
  ).rejects.toThrow("Save failed");
  expect(state.events).toEqual(["upload", "save", "remove-new"]);
});
it("removes the old logo only after committing the replacement", async () => {
  await saveBrand(kit, new File(["image"], "new.png", { type: "image/png" }));
  expect(state.events).toEqual(["upload", "save", "remove-old"]);
});
it("preserves a logo when removing its database reference fails", async () => {
  state.fail = true;
  await expect(removeLogo(kit)).rejects.toThrow("Save failed");
  expect(state.events).toEqual(["save"]);
});
it("saves the empty reference before deleting a removed logo", async () => {
  expect((await removeLogo(kit)).logoPath).toBeNull();
  expect(state.events).toEqual(["save", "remove-old"]);
});
