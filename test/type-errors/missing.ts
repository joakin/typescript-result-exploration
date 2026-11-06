import type { ImportFileError } from "../support.ts";

export function missingHandler(error: ImportFileError) {
  return error.match({ ImportReadFailed: (failure) => failure.details.path });
}
