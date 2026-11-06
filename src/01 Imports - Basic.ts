import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import {
  manifestSchema,
  structuredDocumentSchema,
  contentHash,
  type Manifest,
  type StructuredDocument,
} from "./support/import-data.ts";

export function readText(path: string): Promise<string> {
  return Bun.file(path).text();
}

export function parseJson(text: string): unknown {
  return JSON.parse(text);
}

export async function readJson(path: string): Promise<unknown> {
  const text = await readText(path);
  return parseJson(text);
}

export async function loadManifest(path: string): Promise<Manifest> {
  const raw = await readJson(path);
  return manifestSchema.parse(raw);
}

export type LoadedImport = {
  manifest: Manifest;
  pdfPath: string;
  document: StructuredDocument;
  digest: string;
  hash: string;
};

export async function loadImport(manifestPath: string): Promise<LoadedImport> {
  const manifest = await loadManifest(manifestPath);

  const directory = dirname(resolve(manifestPath));
  const pdfPath = resolve(directory, manifest.sourcePdf);
  const documentPath = resolve(directory, manifest.structuredDocument);
  const rawDocument = await readJson(documentPath);
  const document = structuredDocumentSchema.parse(rawDocument);

  const bytes = await Bun.file(pdfPath).bytes();
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (
    digest !== manifest.sourceSha256 ||
    digest !== document.source.sha256 ||
    bytes.byteLength !== document.source.byteLength
  ) {
    throw new Error(`Source identity mismatch for ${pdfPath}.`);
  }

  return {
    manifest,
    pdfPath,
    document,
    digest,
    hash: contentHash(document),
  };
}
