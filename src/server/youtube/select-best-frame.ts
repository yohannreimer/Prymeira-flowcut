import { readFile } from "node:fs/promises";
import OpenAI from "openai";

type SelectBestFrameResponse = {
  choices: Array<{ message: { content: string | null } }>;
};

type SelectBestFrameDeps = {
  chatCompletionsCreate?: (params: Record<string, unknown>) => Promise<SelectBestFrameResponse>;
  readImageFile?: (filePath: string) => Promise<Buffer>;
};

/**
 * Sends candidate frame images to GPT-4o Vision and returns the index
 * of the frame with the most engaging facial expression.
 * Returns 0 silently on any error.
 */
export async function selectBestFrame(
  candidatePaths: string[],
  apiKey?: string,
  deps: SelectBestFrameDeps = {}
): Promise<number> {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key && !deps.chatCompletionsCreate) return 0;
  if (candidatePaths.length === 0) return 0;

  try {
    const readFn = deps.readImageFile ?? readFile;
    const imageContents = await Promise.all(
      candidatePaths.map(async (p) => {
        const buffer = await readFn(p);
        const base64 = buffer.toString("base64");
        return {
          type: "image_url" as const,
          image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "low" as const },
        };
      })
    );

    const callCreate: (params: Record<string, unknown>) => Promise<SelectBestFrameResponse> =
      deps.chatCompletionsCreate ??
      (async (params) => {
        const client = new OpenAI({ apiKey: key });
        const result = await client.chat.completions.create(
          params as unknown as Parameters<typeof client.chat.completions.create>[0]
        );
        return result as SelectBestFrameResponse;
      });

    const response = await callCreate({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            ...imageContents,
            {
              type: "text",
              text: `These are ${candidatePaths.length} video frames numbered 0 to ${candidatePaths.length - 1}. Pick the one with the most engaging facial expression for a YouTube thumbnail: eyes open, looking toward camera, expressive or energetic. Return only JSON: {"index": N}`,
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 20,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { index?: unknown };
    const index = typeof parsed.index === "number" ? Math.round(parsed.index) : 0;
    return index >= 0 && index < candidatePaths.length ? index : 0;
  } catch {
    return 0;
  }
}
