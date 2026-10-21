import { createFileRoute } from "@tanstack/react-router";
import { generateImage } from "@/lib/image-gateway.server";
import { recordAIUsage, UsageLimitError } from "@/lib/usage";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateImageRequest } = await import("@/lib/image-auth.server");
        const context = await authenticateImageRequest(request);
        if (!context) {
          return new Response("Sign in to create images.", { status: 401 });
        }
        const { prompt, stream = true } = (await request.json()) as {
          prompt?: string;
          stream?: boolean;
        };
        const text = String(prompt ?? "")
          .trim()
          .slice(0, 4000);
        if (!text) return new Response("Describe the image first.", { status: 400 });
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI is not configured.", { status: 500 });
        try {
          await recordAIUsage(context, "image", 1);
        } catch (e) {
          return new Response(e instanceof Error ? e.message : "Couldn't check AI usage.", {
            status: e instanceof UsageLimitError ? 429 : 503,
            headers: { "Cache-Control": "no-store" },
          });
        }
        const upstream = await generateImage(apiKey, text, stream);
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
