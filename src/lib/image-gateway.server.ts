export const imageSettings = {
  baseURL: "https://ai.gateway.lovable.dev",
  model: "openai/gpt-image-2.5-sunburst",
};

export function generateImage(apiKey: string, prompt: string, stream = true) {
  return fetch(`${imageSettings.baseURL}/v1/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: imageSettings.model,
      prompt,
      ...(stream ? { stream: true, partial_images: 1 } : {}),
    }),
  });
}
