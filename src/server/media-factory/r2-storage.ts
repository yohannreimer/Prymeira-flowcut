import fs from "node:fs/promises";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export type R2Config = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucket: string;
  publicBaseUrl: string;
};

type R2ClientLike = {
  send: (command: any) => Promise<unknown>;
};

export function getR2ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): R2Config | null {
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const endpoint = env.R2_ENDPOINT?.trim();
  const bucket = env.R2_BUCKET?.trim();
  const publicBaseUrl = env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket || !publicBaseUrl) {
    return null;
  }

  return {
    accessKeyId,
    secretAccessKey,
    endpoint,
    bucket,
    publicBaseUrl
  };
}

export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

export function buildR2PublicUrl({
  publicBaseUrl,
  objectKey
}: {
  publicBaseUrl: string;
  objectKey: string;
}): string {
  const encodedKey = objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${publicBaseUrl.replace(/\/+$/, "")}/${encodedKey}`;
}

export function createR2ObjectKey({
  packageId,
  clipRank,
  fileName
}: {
  packageId: string;
  clipRank: string;
  fileName: string;
}): string {
  return `instagram/${slugifyPathSegment(packageId)}/${slugifyPathSegment(clipRank)}/${slugifyPathSegment(fileName)}`;
}

export async function uploadFileToR2({
  filePath,
  objectKey,
  contentType,
  config,
  client = createR2Client(config)
}: {
  filePath: string;
  objectKey: string;
  contentType: string;
  config: R2Config;
  client?: R2ClientLike;
}): Promise<{ objectKey: string; publicUrl: string }> {
  const body = await fs.readFile(filePath);
  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    Body: body,
    ContentType: contentType
  }));

  return {
    objectKey,
    publicUrl: buildR2PublicUrl({
      publicBaseUrl: config.publicBaseUrl,
      objectKey
    })
  };
}

export async function deleteR2Object({
  objectKey,
  config,
  client = createR2Client(config)
}: {
  objectKey: string;
  config: R2Config;
  client?: R2ClientLike;
}): Promise<void> {
  await client.send(new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: objectKey
  }));
}

function slugifyPathSegment(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "arquivo";
}
