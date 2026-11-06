import type { ImportFileError } from "../support.ts";

export function extraHandler(error: ImportFileError) {
  return error.match({
    ImportReadFailed: () => "read",
    ImportJsonInvalid: () => "json",
    Unexpected: () => "extra",
  });
}
