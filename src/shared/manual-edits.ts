import { z } from "zod";
import { colorAdjustmentsSchema, colorPresetSchema } from "./color-presets";

export const manualCutSchema = z
  .object({
    id: z.string().min(1),
    startSec: z.number().finite().nonnegative(),
    endSec: z.number().finite().nonnegative()
  })
  .refine((cut) => cut.endSec > cut.startSec, {
    message: "endSec must be greater than startSec",
    path: ["endSec"]
  });

export const manualRenderRequestSchema = z.object({
  activeCutIds: z.array(z.string().min(1)).optional(),
  activeCuts: z.array(manualCutSchema).optional(),
  colorPresetId: colorPresetSchema.optional(),
  colorAdjustments: colorAdjustmentsSchema.partial().optional(),
  flipHorizontal: z.boolean().optional(),
  musicPath: z.string().min(1).nullable().optional(),
  audioCleanup: z.boolean().optional(),
  audioDucking: z.boolean().optional(),
  preview: z
    .object({
      enabled: z.boolean().default(true),
      durationSec: z.number().finite().positive().max(60).default(20),
      focusTimelineSec: z.number().finite().nonnegative().optional(),
      focusSourceSec: z.number().finite().nonnegative().optional()
    })
    .optional()
});

export type ManualCut = z.infer<typeof manualCutSchema>;
export type ManualRenderRequest = z.infer<typeof manualRenderRequestSchema>;
