import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import type { ZodError } from "zod";
import {
  manifestSchema,
  structuredDocumentSchema,
  contentHash,
  type Manifest,
  type StructuredDocument,
} from "./support/import-data.ts";
import { Result } from "./result.ts";

type FileFailure = {
  path: string;
  cause: unknown;
  message: string;
};

export class ImportReadFailed extends Result.taggedError(
  "ImportReadFailed",
)<FileFailure> {}

export async function readText(
  path: string,
): Promise<Result<string, ImportReadFailed>> {
  try {
    return Result.ok(await Bun.file(path).text());
  } catch (cause) {
    return Result.err(
      new ImportReadFailed({
        path,
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
    );
  }
}

export class ImportJsonInvalid extends Result.taggedError(
  "ImportJsonInvalid",
)<FileFailure> {}

export function parseJson(
  text: string,
  path: string,
): Result<unknown, ImportJsonInvalid> {
  try {
    const value: unknown = JSON.parse(text);
    return Result.ok(value);
  } catch (cause) {
    return Result.err(
      new ImportJsonInvalid({
        path,
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
    );
  }
}

export type ImportFileError = ImportReadFailed | ImportJsonInvalid;

export async function readJson(
  path: string,
): Promise<Result<unknown, ImportFileError>> {
  const text = await readText(path);
  if (!text.ok) return text;

  return parseJson(text.value, path);
}

export class ImportValidationFailed extends Result.taggedError(
  "ImportValidationFailed",
)<{
  path: string;
  cause: ZodError;
  message: string;
}> {}

export async function loadManifest(path: string) {
  const raw = await readJson(path);
  if (!raw.ok) return raw;

  const parsed = manifestSchema.safeParse(raw.value);
  if (!parsed.success) {
    return Result.err(
      new ImportValidationFailed({
        path,
        cause: parsed.error,
        message: parsed.error.message,
      }),
    );
  }

  return Result.ok(parsed.data);
}

export type LoadedImport = {
  manifest: Manifest;
  pdfPath: string;
  document: StructuredDocument;
  digest: string;
  hash: string;
};

export class SourceIdentityMismatch extends Result.taggedError(
  "SourceIdentityMismatch",
)<{
  path: string;
  expectedHash: string;
  actualHash: string;
  structuredHash: string;
  expectedBytes: number;
  actualBytes: number;
}> {}

export type ImportError =
  | ImportReadFailed
  | ImportJsonInvalid
  | ImportValidationFailed
  | SourceIdentityMismatch;

export async function loadImport(
  manifestPath: string,
): Promise<Result<LoadedImport, ImportError>> {
  const manifest = await loadManifest(manifestPath);
  if (!manifest.ok) return manifest;

  const directory = dirname(resolve(manifestPath));
  const pdfPath = resolve(directory, manifest.value.sourcePdf);
  const documentPath = resolve(directory, manifest.value.structuredDocument);
  const rawDocument = await readJson(documentPath);
  if (!rawDocument.ok) return rawDocument;

  const parsedDocument = structuredDocumentSchema.safeParse(rawDocument.value);
  if (!parsedDocument.success) {
    return Result.err(
      new ImportValidationFailed({
        path: documentPath,
        cause: parsedDocument.error,
        message: parsedDocument.error.message,
      }),
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await Bun.file(pdfPath).bytes();
  } catch (cause) {
    return Result.err(
      new ImportReadFailed({
        path: pdfPath,
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
    );
  }

  const document = parsedDocument.data;
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (
    digest !== manifest.value.sourceSha256 ||
    digest !== document.source.sha256 ||
    bytes.byteLength !== document.source.byteLength
  ) {
    return Result.err(
      new SourceIdentityMismatch({
        path: pdfPath,
        expectedHash: manifest.value.sourceSha256,
        actualHash: digest,
        structuredHash: document.source.sha256,
        expectedBytes: document.source.byteLength,
        actualBytes: bytes.byteLength,
      }),
    );
  }

  return Result.ok({
    manifest: manifest.value,
    pdfPath,
    document,
    digest,
    hash: contentHash(document),
  });
}
