import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "owner" }, ready: true }) }));
vi.mock("@/components/SiteHeader", () => ({ SiteHeader: () => null }));
vi.mock("@/components/PronunciationHints", () => ({ PronunciationHints: () => null }));
vi.mock("@/lib/studio.functions", () => ({
  VOICES: ["Kore", "Puck"],
  generateSpeech: async () => ({ mime: "audio/wav", audio: "AA==" }),
  speakWithMyVoice: vi.fn(),
}));
vi.mock("@/lib/voices", () => ({ listVoices: async () => [] }));
vi.mock("@/lib/join-audio", () => ({
  joinAudio: async () => new Blob(["wav"], { type: "audio/wav" }),
}));
vi.mock("@/lib/library", () => ({ saveClip: vi.fn() }));
vi.mock("@/lib/media-client", () => ({ download: vi.fn() }));
import { Route } from "@/routes/dialogue";
const Dialogue = Route.options.component as ComponentType;
beforeEach(() =>
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:conversation"),
    revokeObjectURL: vi.fn(),
  }),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("removes the previous downloadable mix when the script changes", async () => {
  render(<Dialogue />);
  fireEvent.click(screen.getByRole("button", { name: "Generate conversation" }));
  await screen.findByRole("heading", { name: "Conversation" });
  fireEvent.change(screen.getByRole("textbox", { name: "Dialogue script" }), {
    target: { value: "HOST: A revised script." },
  });
  expect(screen.queryByRole("heading", { name: "Conversation" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save to library" })).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:conversation");
});

it("shows the per-request total for a batch of short lines", () => {
  render(<Dialogue />);
  fireEvent.change(screen.getByRole("textbox", { name: "Dialogue script" }), {
    target: { value: Array(20).fill("HOST: Hello there.").join("\n") },
  });
  expect(screen.getByTitle("Estimated cost before you generate")).toHaveTextContent("20 credits");
});
