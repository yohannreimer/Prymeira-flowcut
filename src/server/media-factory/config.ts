import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const approvalModeSchema = z.enum(["manual", "automatic"]);
const publisherModeSchema = z.enum(["disabled", "dry-run", "live"]);
const nonEmptyStringSchema = z.string().trim().min(1);

const horizontalConfigSchema = z
  .object({
    youtube: z.boolean().default(true),
    podcast: z.boolean().default(true),
    xThread: z.boolean().default(true)
  })
  .default({});

const backgroundMusicConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    musicDir: nonEmptyStringSchema.nullable().default(null),
    volume: z.number().finite().min(0).max(0.3).default(0.08),
    selection: z.literal("random").default("random")
  })
  .default({});

const verticalConfigSchema = z
  .object({
    supoclip: z.boolean().default(false),
    maxClips: z.number().int().positive().default(5),
    captionTemplate: nonEmptyStringSchema.default("padrao-yohann")
  })
  .default({});

const publishersConfigSchema = z
  .object({
    youtube: publisherModeSchema.default("dry-run"),
    instagram: publisherModeSchema.default("dry-run"),
    tiktok: publisherModeSchema.default("dry-run"),
    x: publisherModeSchema.default("dry-run"),
    spotify: publisherModeSchema.default("dry-run")
  })
  .default({});

const supoclipConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    rootDir: nonEmptyStringSchema.default("/Users/yohannreimer/Documents/supoclip"),
    backendUrl: nonEmptyStringSchema.default("http://localhost:8000"),
    autoStart: z.boolean().default(true),
    userId: nonEmptyStringSchema.default("media-factory"),
    maxClips: z.number().int().positive().max(20).default(5),
    minClipDurationSec: z.number().finite().min(1).max(120).default(12),
    captionTemplate: nonEmptyStringSchema.default("default"),
    processingMode: z.enum(["fast", "balanced", "quality"]).default("fast"),
    outputFormat: z.enum(["vertical", "original"]).default("vertical"),
    addSubtitles: z.boolean().default(true),
    cutLongPauses: z.boolean().default(true)
  })
  .default({});

const aiConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    provider: z.literal("openai").default("openai"),
    model: nonEmptyStringSchema.default("gpt-4.1-mini"),
    transcriptionModel: nonEmptyStringSchema.default("whisper-1"),
    language: nonEmptyStringSchema.default("pt"),
    promptVersions: z.record(z.string()).default({})
  })
  .default({});

export const mediaFactoryConfigSchema = z
  .object({
    rootDir: nonEmptyStringSchema,
    inputDir: nonEmptyStringSchema.optional(),
    outputDir: nonEmptyStringSchema.optional(),
    approvalMode: approvalModeSchema.default("manual"),
    horizontal: horizontalConfigSchema,
    backgroundMusic: backgroundMusicConfigSchema,
    vertical: verticalConfigSchema,
    publishers: publishersConfigSchema,
    ai: aiConfigSchema,
    supoclip: supoclipConfigSchema
  })
  .transform((config) => {
    const rootDir = path.resolve(config.rootDir);

    return {
      ...config,
      rootDir,
      inputDir: path.resolve(config.inputDir ?? path.join(rootDir, "Entrada")),
      outputDir: path.resolve(config.outputDir ?? path.join(rootDir, "Saida"))
    };
  });

export type MediaFactoryConfig = z.infer<typeof mediaFactoryConfigSchema>;

export function resolveMediaFactoryConfig(config: z.input<typeof mediaFactoryConfigSchema>): MediaFactoryConfig {
  return mediaFactoryConfigSchema.parse(config);
}

export async function loadMediaFactoryConfigFromFile(
  configPath: string,
  fallback: Pick<z.input<typeof mediaFactoryConfigSchema>, "rootDir">
): Promise<MediaFactoryConfig> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return resolveMediaFactoryConfig({ ...fallback, ...JSON.parse(raw) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return resolveMediaFactoryConfig(fallback);
    }
    throw error;
  }
}
