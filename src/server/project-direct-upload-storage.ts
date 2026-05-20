import type { ProjectDirectUploadStorage } from "./routes/projects";
import {
  createSignedR2UploadUrl,
  deleteR2Object,
  downloadR2ObjectToFile,
  getR2ConfigFromEnv,
  getR2ObjectSize,
  type R2Config
} from "./media-factory/r2-storage";

export function createR2ProjectDirectUploadStorage(
  config: R2Config | null = getR2ConfigFromEnv()
): ProjectDirectUploadStorage | null {
  if (!config) return null;

  return {
    createSignedUploadUrl(input) {
      return createSignedR2UploadUrl({
        objectKey: input.storageKey,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        config
      });
    },
    getUploadedObjectSize(storageKey) {
      return getR2ObjectSize({
        objectKey: storageKey,
        config
      });
    },
    downloadObjectToFile(input) {
      return downloadR2ObjectToFile({
        objectKey: input.storageKey,
        outputPath: input.outputPath,
        config
      });
    },
    deleteObject(storageKey) {
      return deleteR2Object({
        objectKey: storageKey,
        config
      });
    }
  };
}
