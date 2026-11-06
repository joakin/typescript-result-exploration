import type { ImportFileError, PassageNotFound } from "../support.ts";

export function expandedUnion(error: ImportFileError | PassageNotFound) {
  return error.match({
    ImportReadFailed: () => "read",
    ImportJsonInvalid: () => "json",
  });
}
