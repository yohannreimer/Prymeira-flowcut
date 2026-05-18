import { readFile } from "node:fs/promises";
import OpenAI from "openai";

type SelectIdentityPhotoResponse = {
  choices: Array<{ message: { content: string | null } }>;
};

type SelectIdentityPhotoDeps = {
  chatCompletionsCreate?: (params: Record<string, unknown>) => Promise<SelectIdentityPhotoResponse>;
  readImageFile?: (filePath: string) => Promise<Buffer>;
};

/**
 * Given a list of identity photo paths and the video title, uses GPT-4o Vision
 * to select the photo whose expression best fits the video theme.
 * Returns the index of the selected photo. Returns 0 silently on any error.
 */
export async function selectIdentityPhoto(
  photoPaths: string[],
  videoTitle: string,
  apiKey?: string,
  deps: SelectIdentityPhotoDeps = {}
): Promise<number> {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key && !deps.chatCompletionsCreate) return 0;
  if (photoPaths.length === 0) return 0;

  try {
    const readFn = deps.readImageFile ?? readFile;
    const imageContents = await Promise.all(
      photoPaths.map(async (p) => {
        const buffer = await readFn(p);
        const base64 = buffer.toString("base64");
        return {
          type: "image_url" as const,
          image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "low" as const },
        };
      })
    );

    const callCreate: (params: Record<string, unknown>) => Promise<SelectIdentityPhotoResponse> =
      deps.chatCompletionsCreate ??
      (async (params) => {
        const client = new OpenAI({ apiKey: key });
        const result = await client.chat.completions.create(
          params as unknown as Parameters<typeof client.chat.completions.create>[0]
        );
        return result as SelectIdentityPhotoResponse;
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
              text: `Este vídeo se chama "${videoTitle}". Qual dessas ${photoPaths.length} fotos (numeradas de 0 a ${photoPaths.length - 1}) tem a expressão mais adequada para a thumbnail desse tema? Retorna apenas JSON: {"index": N}`,
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
    return index >= 0 && index < photoPaths.length ? index : 0;
  } catch {
    return 0;
  }
}
