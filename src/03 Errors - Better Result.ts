import { TaggedError } from "better-result";
import {
  readJson,
  type ImportFileError,
} from "./01 Imports - Better Result.ts";

export class IndexPreparationFailed extends TaggedError(
  "IndexPreparationFailed",
)<{
  path: string;
  cause: ImportFileError;
}> {}

export async function prepareSource(path: string) {
  const source = await readJson(path);

  return source.mapError(
    (cause) => new IndexPreparationFailed({ path, cause }),
  );
}

export async function describeSource(path: string) {
  const source = await readJson(path);

  return source.match({
    ok: () => "Loaded JSON.",
    err: (error) =>
      error.match({
        ImportReadFailed: (failure) =>
          `Cannot read ${failure.path}: ${failure.message}`,
        ImportJsonInvalid: (failure) =>
          `Invalid JSON in ${failure.path}: ${failure.message}`,
      }),
  });
}
