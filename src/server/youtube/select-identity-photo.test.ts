import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectIdentityPhoto } from "./select-identity-photo";

const stubReadImageFile = vi.fn().mockResolvedValue(Buffer.from("fake-jpeg"));

describe("selectIdentityPhoto", () => {
  beforeEach(() => {
    stubReadImageFile.mockClear();
  });

  it("returns the index from a successful GPT-4o Vision response", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"index": 2}' } }],
    });
    const result = await selectIdentityPhoto(
      ["pensativo.jpg", "surpreso.jpg", "apontando.jpg"],
      "Como eu automatizo meu YouTube",
      "test-key",
      { chatCompletionsCreate: mockCreate, readImageFile: stubReadImageFile }
    );
    expect(result).toBe(2);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("includes the video title in the prompt", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"index": 0}' } }],
    });
    await selectIdentityPhoto(
      ["a.jpg", "b.jpg"],
      "Meu título de teste",
      "test-key",
      { chatCompletionsCreate: mockCreate, readImageFile: stubReadImageFile }
    );
    const calledMessages = mockCreate.mock.calls[0][0].messages;
    const textContent = calledMessages[0].content.find(
      (c: { type: string }) => c.type === "text"
    );
    expect(textContent.text).toContain("Meu título de teste");
    const imageContents = calledMessages[0].content.filter(
      (c: { type: string }) => c.type === "image_url"
    );
    expect(imageContents).toHaveLength(2); // one per photo path
  });

  it("returns 0 when the response index is out of range", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"index": 99}' } }],
    });
    const result = await selectIdentityPhoto(
      ["a.jpg", "b.jpg"],
      "Título qualquer",
      "test-key",
      { chatCompletionsCreate: mockCreate, readImageFile: stubReadImageFile }
    );
    expect(result).toBe(0);
  });

  it("returns 0 when the OpenAI call throws", async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error("network error"));
    const result = await selectIdentityPhoto(
      ["a.jpg", "b.jpg"],
      "Título qualquer",
      "test-key",
      { chatCompletionsCreate: mockCreate, readImageFile: stubReadImageFile }
    );
    expect(result).toBe(0);
  });

  it("returns 0 when no API key is provided and no client override", async () => {
    const result = await selectIdentityPhoto(["a.jpg"], "Título qualquer", undefined);
    expect(result).toBe(0);
  });

  it("returns 0 when photoPaths is empty", async () => {
    const mockCreate = vi.fn();
    const result = await selectIdentityPhoto([], "Título qualquer", "test-key", {
      chatCompletionsCreate: mockCreate,
    });
    expect(result).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
