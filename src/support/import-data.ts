import { createHash } from "node:crypto";
import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

export const manifestSchema = z.strictObject({
  sourcePdf: z.string().min(1),
  structuredDocument: z.string().min(1),
  sourceSha256: sha256,
});

export type Manifest = z.infer<typeof manifestSchema>;

export const structuredDocumentSchema = z.strictObject({
  title: z.string().min(1),
  source: z.strictObject({
    sha256,
    byteLength: z.number().int().nonnegative(),
  }),
  sections: z.array(z.string()),
});

export type StructuredDocument = z.infer<typeof structuredDocumentSchema>;

export function contentHash(document: StructuredDocument): string {
  return createHash("sha256").update(JSON.stringify(document)).digest("hex");
}
