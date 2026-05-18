import { z } from "zod";
import { captionSettingsSchema } from "./caption-settings";

const safeExportFileName = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((fileName) => fileName === fileName.replace(/[\\/]/g, ""), {
    message: "fileName must not include path separators"
  });

export const exportSettingsSchema = z.object({
  renderMode: z.enum(["fast_cuts", "full"]).default("fast_cuts"),
  format: z.enum(["vertical", "horizontal", "original"]),
  resolution: z.enum(["1080p", "4k", "original"]),
  quality: z.enum(["rapida", "maxima"]),
  fileName: safeExportFileName,
  destinationFolder: z.string().trim().min(1).optional(),
  audioCleanup: z.boolean().default(false),
  audioDucking: z.boolean().default(false),
  sdrMode: z.enum(["preserve", "convert_to_sdr"]).default("preserve"),
  captionSettings: captionSettingsSchema.optional()
});

export type ExportSettings = z.infer<typeof exportSettingsSchema>;
