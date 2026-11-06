import type { ImportFileError, ImportJsonInvalid } from "../support.ts";

export function wrongParameter(error: ImportFileError) {
  return error.match({
    ImportReadFailed: (failure: ImportJsonInvalid) => failure.details.path,
    ImportJsonInvalid: () => "json",
  });
}
