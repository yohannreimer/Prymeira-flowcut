import { describe, expect, it, vi } from "vitest";
import { selectBestFrame } from "./select-best-frame";

const stubReadImageFile = vi.fn().mockResolvedValue(Buffer.from("fake-jpeg"));

describe("selectBestFrame", () => {
  it("returns the index from a successful GPT-4o Vision response", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"index": 3}' } }],
    });
    const result = await selectBestFrame(
      ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg"],
      "test-key",
      { chatCompletionsCreate: mockCreate, readImageFile: stubReadImageFile }
    );
    expect(result).toBe(3);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when the response index is out of range", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"index": 99}' } }],
    });
    const result = await selectBestFrame(["a.jpg", "b.jpg"], "test-key", {
      chatCompletionsCreate: mockCreate,
      readImageFile: stubReadImageFile,
    });
    expect(result).toBe(0);
  });

  it("returns 0 when the OpenAI call throws", async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error("network error"));
    const result = await selectBestFrame(["a.jpg", "b.jpg"], "test-key", {
      chatCompletionsCreate: mockCreate,
      readImageFile: stubReadImageFile,
    });
    expect(result).toBe(0);
  });

  it("returns 0 when no API key is provided and no client override", async () => {
    const result = await selectBestFrame(["a.jpg"], undefined);
    expect(result).toBe(0);
  });
});
