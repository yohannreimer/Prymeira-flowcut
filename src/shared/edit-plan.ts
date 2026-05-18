import { z } from "zod";
import { DEFAULT_CAPTION_SETTINGS, captionSettingsSchema } from "./caption-settings";
import { CAPTION_STYLE_IDS } from "./caption-styles";
import { DEFAULT_COLOR_ADJUSTMENTS, colorAdjustmentsSchema } from "./color-presets";

const TIME_TOLERANCE_SEC = 0.001;
const positiveDuration = z.number().finite().nonnegative();

function withinTolerance(a: number, b: number) {
  return Math.abs(a - b) <= TIME_TOLERANCE_SEC;
}

export const sourceMediaSchema = z.object({
  path: z.string().min(1),
  durationSec: z.number().finite().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().finite().positive(),
  hasAudio: z.boolean()
});

export const segmentSchema = z
  .object({
    id: z.string().min(1),
    sourceStartSec: positiveDuration,
    sourceEndSec: positiveDuration,
    timelineStartSec: positiveDuration,
    timelineEndSec: positiveDuration,
    reason: z.string().min(1)
  })
  .refine((segment) => segment.sourceEndSec > segment.sourceStartSec, {
    message: "sourceEndSec must be greater than sourceStartSec",
    path: ["sourceEndSec"]
  })
  .refine((segment) => segment.timelineEndSec > segment.timelineStartSec, {
    message: "timelineEndSec must be greater than timelineStartSec",
    path: ["timelineEndSec"]
  });

export const removedIntervalSchema = z
  .object({
    id: z.string().min(1),
    startSec: positiveDuration,
    endSec: positiveDuration,
    reason: z.string().min(1)
  })
  .refine((interval) => interval.endSec > interval.startSec, {
    message: "endSec must be greater than startSec",
    path: ["endSec"]
  });

export const captionWordSchema = z
  .object({
    id: z.string().min(1),
    startSec: positiveDuration,
    endSec: positiveDuration,
    text: z.string()
  })
  .refine((word) => word.endSec > word.startSec, {
    message: "endSec must be greater than startSec",
    path: ["endSec"]
  });

export const captionSchema = z
  .object({
    id: z.string().min(1),
    startSec: positiveDuration,
    endSec: positiveDuration,
    text: z.string(),
    styleId: z.enum(CAPTION_STYLE_IDS).catch("youtube_clean"),
    words: z.array(captionWordSchema).default([])
  })
  .refine((caption) => caption.endSec > caption.startSec, {
    message: "endSec must be greater than startSec",
    path: ["endSec"]
  })
  .superRefine((caption, ctx) => {
    caption.words.forEach((word, index) => {
      if (word.startSec < caption.startSec - TIME_TOLERANCE_SEC || word.endSec > caption.endSec + TIME_TOLERANCE_SEC) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "caption word must be within caption duration",
          path: ["words", index, "endSec"]
        });
      }
    });
  });

export const overlaySchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["zoom", "callout", "highlight", "blur", "lower_third"]),
    startSec: positiveDuration,
    endSec: positiveDuration,
    label: z.string().min(1),
    payload: z.record(z.unknown())
  })
  .refine((overlay) => overlay.endSec > overlay.startSec, {
    message: "endSec must be greater than startSec",
    path: ["endSec"]
  });

export const timelineSectionTypeSchema = z.enum(["hook", "talking_head", "screen", "hybrid", "problem", "chapter"]);

export const sectionCaptionTreatmentSchema = captionSettingsSchema.partial().extend({
  enabled: z.boolean().optional()
});

export const sectionAudioTreatmentSchema = z.object({
  voiceCleanup: z.boolean().optional(),
  noiseReduction: z.boolean().optional(),
  compressor: z.boolean().optional(),
  limiter: z.boolean().optional(),
  musicDucking: z.boolean().optional(),
  musicGainDb: z.number().finite().optional()
});

export const sectionImageTreatmentSchema = z.object({
  presetId: z.string().optional(),
  sharpenScreen: z.boolean().optional(),
  sdrMode: z.enum(["preserve", "convert_to_sdr"]).optional()
});

export const sectionMotionSlotSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["zoom", "callout", "highlight", "lower_third", "hook_title", "kinetic_keyword", "focus_frame", "chapter_card"]),
    startSec: positiveDuration,
    endSec: positiveDuration,
    label: z.string().min(1),
    payload: z.record(z.unknown()).default({})
  })
  .refine((slot) => slot.endSec > slot.startSec, {
    message: "endSec must be greater than startSec",
    path: ["endSec"]
  });

export const sectionMotionTreatmentSchema = z.object({
  enabled: z.boolean().default(false),
  slots: z.array(sectionMotionSlotSchema).default([])
});

export const timelineSectionSchema = z
  .object({
    id: z.string().min(1),
    type: timelineSectionTypeSchema,
    startSec: positiveDuration,
    endSec: positiveDuration,
    sourceStartSec: positiveDuration.optional(),
    sourceEndSec: positiveDuration.optional(),
    label: z.string().min(1),
    confidence: z.number().finite().min(0).max(1),
    warnings: z.array(z.string()).default([]),
    treatments: z
      .object({
        captions: sectionCaptionTreatmentSchema.optional(),
        audio: sectionAudioTreatmentSchema.optional(),
        image: sectionImageTreatmentSchema.optional(),
        motion: sectionMotionTreatmentSchema.optional()
      })
      .default({})
  })
  .refine((section) => section.endSec > section.startSec, {
    message: "endSec must be greater than startSec",
    path: ["endSec"]
  })
  .superRefine((section, ctx) => {
    const hasSourceStart = section.sourceStartSec !== undefined;
    const hasSourceEnd = section.sourceEndSec !== undefined;

    if (hasSourceStart !== hasSourceEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "section source range must include both start and end",
        path: hasSourceStart ? ["sourceEndSec"] : ["sourceStartSec"]
      });
      return;
    }

    if (
      section.sourceStartSec !== undefined &&
      section.sourceEndSec !== undefined &&
      section.sourceEndSec <= section.sourceStartSec
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "section sourceEndSec must be greater than sourceStartSec",
        path: ["sourceEndSec"]
      });
    }
  });

export const publishReadinessCheckSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["passed", "warning", "failed"]),
  label: z.string().min(1),
  message: z.string().min(1),
  targetTab: z.enum(["review", "cut", "captions", "audio", "motion", "image", "export"]).optional(),
  sectionId: z.string().min(1).optional()
});

export const publishReadinessSchema = z.object({
  status: z.enum(["ready", "needs_review", "blocked"]),
  checks: z.array(publishReadinessCheckSchema)
});

export const editPlanSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    version: z.number().int().positive(),
    source: sourceMediaSchema,
    segments: z.array(segmentSchema).min(1),
    removed: z.array(removedIntervalSchema),
    sections: z.array(timelineSectionSchema).default([]),
    captions: z.array(captionSchema),
    captionSettings: captionSettingsSchema.default(DEFAULT_CAPTION_SETTINGS),
    overlays: z.array(overlaySchema),
    color: z.object({
      presetId: z.string().min(1),
      label: z.string().min(1),
      adjustments: colorAdjustmentsSchema.default(DEFAULT_COLOR_ADJUSTMENTS)
    }),
    video: z.object({
      flipHorizontal: z.boolean().default(false)
    }).default({ flipHorizontal: false }),
    audio: z.object({
      music: z
        .object({
          path: z.string().min(1),
          gainDb: z.number().finite(),
          duckUnderSpeechDb: z.number().finite()
        })
        .nullable(),
      voiceTargetLufs: z.number().finite()
    }),
    qa: z.object({
      status: z.enum(["not_run", "passed", "warning", "failed"]),
      warnings: z.array(z.string())
    }),
    publishReadiness: publishReadinessSchema.default({ status: "needs_review", checks: [] }),
    createdAt: z.string().datetime()
  })
  .superRefine((plan, ctx) => {
    if (plan.segments.length === 0) {
      return;
    }

    plan.segments.forEach((segment, index) => {
      if (segment.sourceEndSec > plan.source.durationSec) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "segment source range must be within source duration",
          path: ["segments", index, "sourceEndSec"]
        });
      }

      const sourceDuration = segment.sourceEndSec - segment.sourceStartSec;
      const timelineDuration = segment.timelineEndSec - segment.timelineStartSec;

      if (!withinTolerance(sourceDuration, timelineDuration)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "segment source and timeline durations must match",
          path: ["segments", index, "timelineEndSec"]
        });
      }

      const expectedTimelineStart = index === 0 ? 0 : plan.segments[index - 1].timelineEndSec;
      if (!withinTolerance(segment.timelineStartSec, expectedTimelineStart)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "timeline segments must be ordered and contiguous",
          path: ["segments", index, "timelineStartSec"]
        });
      }
    });

    plan.removed.forEach((interval, index) => {
      if (interval.endSec > plan.source.durationSec) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "removed interval must be within source duration",
          path: ["removed", index, "endSec"]
        });
      }
    });

    const renderedDurationSec = plan.segments[plan.segments.length - 1].timelineEndSec;

    plan.sections.forEach((section, index) => {
      if (section.endSec > renderedDurationSec) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "section must be within rendered timeline duration",
          path: ["sections", index, "endSec"]
        });
      }

      if (section.sourceEndSec !== undefined && section.sourceEndSec > plan.source.durationSec) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "section source range must be within source duration",
          path: ["sections", index, "sourceEndSec"]
        });
      }

      section.treatments.motion?.slots.forEach((slot, slotIndex) => {
        if (slot.startSec < section.startSec || slot.endSec > section.endSec) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "motion slot must be within section duration",
            path: ["sections", index, "treatments", "motion", "slots", slotIndex, "endSec"]
          });
        }
      });
    });

    plan.captions.forEach((caption, index) => {
      if (caption.endSec > renderedDurationSec) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "caption must be within rendered timeline duration",
          path: ["captions", index, "endSec"]
        });
      }
    });

    plan.overlays.forEach((overlay, index) => {
      if (overlay.endSec > renderedDurationSec) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "overlay must be within rendered timeline duration",
          path: ["overlays", index, "endSec"]
        });
      }
    });
  });

export type EditPlan = z.infer<typeof editPlanSchema>;
export type SourceMedia = z.infer<typeof sourceMediaSchema>;
export type TimelineSegment = z.infer<typeof segmentSchema>;
export type RemovedInterval = z.infer<typeof removedIntervalSchema>;
export type Caption = z.infer<typeof captionSchema>;
export type CaptionWord = z.infer<typeof captionWordSchema>;
export type CaptionSettings = z.infer<typeof captionSettingsSchema>;
export type Overlay = z.infer<typeof overlaySchema>;
export type TimelineSectionType = z.infer<typeof timelineSectionTypeSchema>;
export type TimelineSection = z.infer<typeof timelineSectionSchema>;
export type SectionCaptionTreatment = z.infer<typeof sectionCaptionTreatmentSchema>;
export type SectionAudioTreatment = z.infer<typeof sectionAudioTreatmentSchema>;
export type SectionImageTreatment = z.infer<typeof sectionImageTreatmentSchema>;
export type SectionMotionTreatment = z.infer<typeof sectionMotionTreatmentSchema>;
export type PublishReadiness = z.infer<typeof publishReadinessSchema>;
export type PublishReadinessCheck = z.infer<typeof publishReadinessCheckSchema>;
