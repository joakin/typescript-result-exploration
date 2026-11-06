import { Result } from "../../src/result.ts";

const tag: string = String("Other");

class DynamicError extends Result.taggedError(tag)<{ dynamic: number }> {}

class StaticError extends Result.taggedError("Static")<{ static: string }> {}

export function wrongWidenedHandler(error: DynamicError | StaticError) {
  return error.match({
    Static: (failure) => failure.details.dynamic.toFixed(),
  });
}
