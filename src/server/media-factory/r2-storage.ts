import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as getAwsSignedUrl } from "@aws-sdk/s3-request-presigner";

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

type R2GetSignedUrl = (
  client: unknown,
  command: PutObjectCommand,
  options: { expiresIn: number }
) => Promise<string>;

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

export async function createSignedR2UploadUrl({
  objectKey,
  contentType,
  sizeBytes,
  config,
  client = createR2Client(config),
  getSignedUrl = getAwsSignedUrl as R2GetSignedUrl,
  expiresInSeconds = 60 * 60
}: {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  config: R2Config;
  client?: R2ClientLike;
  getSignedUrl?: R2GetSignedUrl;
  expiresInSeconds?: number;
}): Promise<string> {
  void sizeBytes;
  return getSignedUrl(
    client as unknown,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ContentType: contentType
    }),
    { expiresIn: expiresInSeconds }
  );
}

export async function getR2ObjectSize({
  objectKey,
  config,
  client = createR2Client(config)
}: {
  objectKey: string;
  config: R2Config;
  client?: R2ClientLike;
}): Promise<number> {
  const response = await client.send(new HeadObjectCommand({
    Bucket: config.bucket,
    Key: objectKey
  })) as { ContentLength?: unknown };
  if (typeof response.ContentLength !== "number" || !Number.isFinite(response.ContentLength)) {
    throw new Error(`R2 object ${objectKey} did not return a valid ContentLength.`);
  }
  return response.ContentLength;
}

export async function downloadR2ObjectToFile({
  objectKey,
  outputPath,
  config,
  client = createR2Client(config)
}: {
  objectKey: string;
  outputPath: string;
  config: R2Config;
  client?: R2ClientLike;
}): Promise<void> {
  const response = await client.send(new GetObjectCommand({
    Bucket: config.bucket,
    Key: objectKey
  })) as { Body?: unknown };
  if (!response.Body) {
    throw new Error(`R2 object ${objectKey} did not return a body.`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const bytes = await streamToUint8Array(response.Body);
  await fs.writeFile(outputPath, bytes);
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

async function streamToUint8Array(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  }
  if (body instanceof Readable) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  }
  if (body && typeof body === "object" && "getReader" in body) {
    const response = new Response(body as ReadableStream);
    return new Uint8Array(await response.arrayBuffer());
  }
  throw new Error("Unsupported R2 object body type.");
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
