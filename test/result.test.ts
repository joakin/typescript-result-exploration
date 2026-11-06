import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Result } from "../src/result.ts";
import {
  ImportReadFailed,
  ImportJsonInvalid,
  PassageNotFound,
  type ImportFileError,
  readJson,
  describeImport,
  wrapFailure,
} from "./support.ts";
import { readJson as readJsonBetter } from "../src/01 Imports - Better Result.ts";

test("tagged errors retain native behavior, context, diagnostics, and typed wrapper causes", () => {
  const cause = new Error("Native failure");
  const error = new ImportReadFailed({
    path: "input.json",
    cause,
    message: "Variable diagnostic",
  });
  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(ImportReadFailed);
  expect(error._tag).toBe("ImportReadFailed");
  expect(error.name).toBe("ImportReadFailed");
  expect(error.message).toBe("Variable diagnostic");
  expect(error.stack).toBeString();
  expect(error.cause).toBe(cause);
  expect(error.details.path).toBe("input.json");
  const wrapped = wrapFailure("passage-1", error).error;
  expect(wrapped.cause).toBe(error);
  expect(wrapped.details.cause).toBe(error);
  expect(wrapped.details.cause.details.path).toBe("input.json");
});

test("errors without diagnostic text use their tag", () => {
  const missing = new PassageNotFound({ passageId: "passage-1" });
  expect(missing.message).toBe("PassageNotFound");
  expect(missing.details).toEqual({ passageId: "passage-1" });
});

test("matching requires an explicit handler rather than an inherited Object method", () => {
  class ObjectNamedError extends Result.taggedError("toString")<{
    value: string;
  }> {}

  const error = new ObjectNamedError({ value: "payload" });
  expect(error.match({ toString: (failure) => failure.details.value })).toBe(
    "payload",
  );
  expect(() => error.match({})).toThrow("Missing error handler for toString.");
});

test("match does not run an inherited handler getter", () => {
  class ExampleError extends Result.taggedError("ExampleError")<object> {}

  class InheritedHandlers {
    get ExampleError(): () => string {
      throw new Error("Inherited getter ran.");
    }
  }

  const error = new ExampleError({});
  expect(() => error.match(new InheritedHandlers())).toThrow(
    "Missing error handler for ExampleError.",
  );
});

test("a union-valued tag dispatches soundly and returns the actual error", () => {
  for (const tag of ["Alpha", "Beta"] as const) {
    function makeError(name: "Alpha" | "Beta") {
      return class DynamicError extends Result.taggedError(name)<{
        value: string;
      }> {};
    }

    const DynamicError = makeError(tag);
    const error = new DynamicError({ value: "payload" });
    const selected: string[] = [];
    const returned = error.match({
      Alpha: (failure) => {
        selected.push("Alpha");
        return failure;
      },
      Beta: (failure) => {
        selected.push("Beta");
        return failure;
      },
    });

    expect(returned).toBe(error);
    expect(selected).toEqual([tag]);
  }
});

test("a widened tag does not erase a literal variant's context", () => {
  function createHandler(tag: string) {
    class DynamicError extends Result.taggedError(tag)<{ dynamic: number }> {}
    class StaticError extends Result.taggedError("Static")<{
      static: string;
    }> {}

    return {
      error: new StaticError({ static: "payload" }),
      handle(error: DynamicError | StaticError) {
        return error.match({
          Static: (failure) =>
            failure instanceof StaticError
              ? failure.details.static
              : failure.details.dynamic.toFixed(),
        });
      },
    };
  }

  const { error, handle } = createHandler("Other");
  expect(handle(error)).toBe("payload");
});

test("match selects only its tag's handler and passes the original concrete error", () => {
  const errors: ImportFileError[] = [
    new ImportReadFailed({
      path: "read.json",
      cause: undefined,
      message: "Read failed",
    }),
    new ImportJsonInvalid({
      path: "parse.json",
      cause: undefined,
      message: "JSON invalid",
    }),
  ];
  for (const error of errors) {
    const calls: string[] = [];
    const value = error.match({
      ImportReadFailed: (failure) => {
        expect(error).toBe(failure);
        calls.push("read");
        return failure.details.path;
      },
      ImportJsonInvalid: (failure) => {
        expect(error).toBe(failure);
        calls.push("json");
        return failure.message.length;
      },
    });
    expect(calls).toEqual([
      error._tag === "ImportReadFailed" ? "read" : "json",
    ]);
    expect(value).toBe(
      error._tag === "ImportReadFailed" ? "read.json" : "JSON invalid".length,
    );
  }
});

test("match preserves a selected Promise and lets handler defects propagate unchanged", async () => {
  function run(error: ImportFileError, selected: Promise<string>) {
    return error.match({
      ImportReadFailed: () => selected,
      ImportJsonInvalid: async () => 42,
    });
  }
  const selected = Promise.resolve("read");
  const error = new ImportReadFailed({
    path: "read.json",
    cause: undefined,
    message: "Read failed",
  });
  expect(run(error, selected)).toBe(selected);
  expect(await run(error, selected)).toBe("read");

  const defect = new TypeError("Handler defect");
  let caught: unknown;
  try {
    error.match({
      ImportReadFailed: () => {
        throw defect;
      },
    });
  } catch (cause) {
    caught = cause;
  }
  expect(caught).toBe(defect);

  await expect(
    error.match({ ImportReadFailed: () => Promise.reject(defect) }),
  ).rejects.toBe(defect);
});

test("ordinary try/catch and direct value access preserve file-loading outcomes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "result-match-check-"));
  try {
    const path = join(directory, "input.json");
    for (const content of [undefined, "{", "null", '{"title":"Authored"}']) {
      if (content !== undefined) await Bun.write(path, content);
      const proposed = await readJson(path);
      const current = await readJsonBetter(path);
      expect(proposed.ok).toBe(current.isOk());
      if (proposed.ok && current.isOk())
        expect(proposed.value).toEqual(current.value);
      else if (!proposed.ok && current.isErr()) {
        expect(proposed.error._tag).toBe(current.error._tag);
        expect(proposed.error.details.path).toBe(current.error.path);
        expect(proposed.error.message).toBe(current.error.message);
      } else throw new Error("Expected matching outcomes");
    }
    expect(await describeImport(path)).toBe("Loaded JSON.");
    await Bun.write(path, "{");
    expect(await describeImport(path)).toStartWith(`Invalid JSON in ${path}:`);
    await rm(path);
    expect(await describeImport(path)).toStartWith(`Cannot read ${path}:`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ordinary async early returns remain native Promises and dispose using resources", async () => {
  let disposed = false;
  const resource = {
    [Symbol.dispose]() {
      disposed = true;
    },
  };
  async function read(): Promise<Result<void, PassageNotFound>> {
    using active = resource;
    void active;
    const result = await Promise.resolve(
      Result.err(new PassageNotFound({ passageId: "absent" })),
    );
    if (!result.ok) return result;
    return Result.ok();
  }
  const pending = read();
  expect(pending).toBeInstanceOf(Promise);
  expect((await pending).ok).toBe(false);
  expect(disposed).toBe(true);
});
