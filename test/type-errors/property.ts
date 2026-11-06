import type { ImportReadFailed, PassageNotFound } from "../support.ts";

export function wrongField(error: ImportReadFailed | PassageNotFound) {
  return error.match({
    ImportReadFailed: (failure) => failure.details.passageId,
    PassageNotFound: () => "missing",
  });
}
