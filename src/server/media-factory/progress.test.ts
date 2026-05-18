import { describe, expect, it, vi } from "vitest";
import { createProgressReporter, silentProgressReporter } from "./progress";

describe("createProgressReporter", () => {
  it("writes info messages with a timestamp", () => {
    const lines: string[] = [];
    const reporter = createProgressReporter({
      write: (line) => lines.push(line),
      now: () => new Date("2026-05-11T10:00:00Z")
    });

    reporter.info("Config carregada");

    expect(lines).toEqual(["[10:00:00] INFO Config carregada"]);
  });

  it("writes warn messages with the AVISO level", () => {
    const lines: string[] = [];
    const reporter = createProgressReporter({
      write: (line) => lines.push(line),
      now: () => new Date("2026-05-11T10:00:00Z")
    });

    reporter.warn("SupoClip indisponivel");

    expect(lines).toEqual(["[10:00:00] AVISO SupoClip indisponivel"]);
  });

  it("throttles polling messages by the configured interval", () => {
    let current = 0;
    const lines: string[] = [];
    const reporter = createProgressReporter({
      write: (line) => lines.push(line),
      nowMs: () => current,
      minIntervalMs: 5000
    });

    reporter.poll("SupoClip processando");
    current = 1000;
    reporter.poll("SupoClip processando");
    current = 6000;
    reporter.poll("SupoClip processando");

    expect(lines).toHaveLength(2);
  });

  it("provides a silent reporter that ignores all messages", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      silentProgressReporter.info("Config carregada");
      silentProgressReporter.warn("SupoClip indisponivel");
      silentProgressReporter.poll("SupoClip processando");

      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
