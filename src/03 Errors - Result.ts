import { readJson, type ImportFileError } from "./01 Imports - Result.ts";
import { Result } from "./result.ts";

export class IndexPreparationFailed extends Result.taggedError(
  "IndexPreparationFailed",
)<{
  path: string;
  cause: ImportFileError;
}> {}

export async function prepareSource(path: string) {
  const source = await readJson(path);
  if (!source.ok) {
    return Result.err(
      new IndexPreparationFailed({ path, cause: source.error }),
    );
  }

  return source;
}

export async function describeSource(path: string) {
  const source = await readJson(path);

  return source.ok
    ? "Loaded JSON."
    : source.error.match({
        ImportReadFailed: (failure) =>
          `Cannot read ${failure.details.path}: ${failure.message}`,
        ImportJsonInvalid: (failure) =>
          `Invalid JSON in ${failure.details.path}: ${failure.message}`,
      });
}
