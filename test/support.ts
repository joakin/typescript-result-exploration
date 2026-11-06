import {
  readText,
  parseJson,
  type ImportFileError,
} from "../src/01 Imports - Result.ts";
import { Result } from "../src/result.ts";

export {
  readJson,
  ImportReadFailed,
  ImportJsonInvalid,
  type ImportFileError,
} from "../src/01 Imports - Result.ts";
export { describeSource as describeImport } from "../src/03 Errors - Result.ts";

export async function readJsonInferred(path: string) {
  const text = await readText(path);
  if (!text.ok) return text;

  return parseJson(text.value, path);
}

export function describeImportFailure(error: ImportFileError): string {
  return error.match({
    ImportReadFailed: (failure) =>
      `Cannot read ${failure.details.path}: ${failure.message}`,
    ImportJsonInvalid: (failure) =>
      `Invalid JSON in ${failure.details.path}: ${failure.message}`,
  });
}

export class PassageNotFound extends Result.taggedError("PassageNotFound")<{
  passageId: string;
}> {}

export class SourceReadFailed extends Result.taggedError("SourceReadFailed")<{
  passageId: string;
  cause: ImportFileError;
}> {}

export function wrapFailure(passageId: string, cause: ImportFileError) {
  return Result.err(new SourceReadFailed({ passageId, cause }));
}
