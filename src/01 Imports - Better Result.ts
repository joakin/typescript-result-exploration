import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { Result, TaggedError } from "better-result";
import type { ZodError } from "zod";
import {
  manifestSchema,
  structuredDocumentSchema,
  contentHash,
  type Manifest,
  type StructuredDocument,
} from "./support/import-data.ts";

type FileFailure = {
  path: string;
  cause: unknown;
  message: string;
};

export class ImportReadFailed extends TaggedError(
  "ImportReadFailed",
)<FileFailure> {}

export function readText(
  path: string,
): Promise<Result<string, ImportReadFailed>> {
  return Result.tryPromise({
    try: () => Bun.file(path).text(),
    catch: (cause) =>
      new ImportReadFailed({
        path,
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

export class ImportJsonInvalid extends TaggedError(
  "ImportJsonInvalid",
)<FileFailure> {}

export function parseJson(
  text: string,
  path: string,
): Result<unknown, ImportJsonInvalid> {
  return Result.try({
    try: (): unknown => JSON.parse(text),
    catch: (cause) =>
      new ImportJsonInvalid({
        path,
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

export type ImportFileError = ImportReadFailed | ImportJsonInvalid;

export function readJson(
  path: string,
): Promise<Result<unknown, ImportFileError>> {
  return Result.gen(async function* () {
    const text = yield* Result.await(readText(path));
    return parseJson(text, path);
  });
}

export class ImportValidationFailed extends TaggedError(
  "ImportValidationFailed",
)<{
  path: string;
  cause: ZodError;
  message: string;
}> {}

export function loadManifest(path: string) {
  return Result.gen(async function* () {
    const raw = yield* Result.await(readJson(path));
    const parsed = manifestSchema.safeParse(raw);
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
  });
}

export type LoadedImport = {
  manifest: Manifest;
  pdfPath: string;
  document: StructuredDocument;
  digest: string;
  hash: string;
};

export class SourceIdentityMismatch extends TaggedError(
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

export function loadImport(
  manifestPath: string,
): Promise<Result<LoadedImport, ImportError>> {
  return Result.gen(async function* () {
    const manifest = yield* Result.await(loadManifest(manifestPath));
    const directory = dirname(resolve(manifestPath));
    const pdfPath = resolve(directory, manifest.sourcePdf);
    const documentPath = resolve(directory, manifest.structuredDocument);
    const rawDocument = yield* Result.await(readJson(documentPath));
    const parsedDocument = structuredDocumentSchema.safeParse(rawDocument);
    if (!parsedDocument.success) {
      return Result.err(
        new ImportValidationFailed({
          path: documentPath,
          cause: parsedDocument.error,
          message: parsedDocument.error.message,
        }),
      );
    }

    const document = parsedDocument.data;
    const bytes = yield* Result.await(
      Result.tryPromise({
        try: () => Bun.file(pdfPath).bytes(),
        catch: (cause) =>
          new ImportReadFailed({
            path: pdfPath,
            cause,
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
    );
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (
      digest !== manifest.sourceSha256 ||
      digest !== document.source.sha256 ||
      bytes.byteLength !== document.source.byteLength
    ) {
      return Result.err(
        new SourceIdentityMismatch({
          path: pdfPath,
          expectedHash: manifest.sourceSha256,
          actualHash: digest,
          structuredHash: document.source.sha256,
          expectedBytes: document.source.byteLength,
          actualBytes: bytes.byteLength,
        }),
      );
    }

    return Result.ok({
      manifest,
      pdfPath,
      document,
      digest,
      hash: contentHash(document),
    });
  });
}
