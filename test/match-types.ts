import { Result, type Err, type Ok } from "../src/result.ts";
import {
  ImportReadFailed,
  ImportJsonInvalid,
  type ImportFileError,
  readJsonInferred,
  type PassageNotFound,
  wrapFailure,
} from "./support.ts";

type ErrorOf<R> = R extends Err<infer E> ? E : never;

type ValueOf<R> = R extends Ok<infer T> ? T : never;

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

type Assert<T extends true> = T;

export type InferredErrors = Assert<
  Equal<ErrorOf<Awaited<ReturnType<typeof readJsonInferred>>>, ImportFileError>
>;

export type InferredValue = Assert<
  Equal<ValueOf<Awaited<ReturnType<typeof readJsonInferred>>>, unknown>
>;

export type TypedCause = Assert<
  Equal<
    ReturnType<typeof wrapFailure>["error"]["details"]["cause"],
    ImportFileError
  >
>;

export function mixedReturn(error: ImportFileError) {
  return error.match({
    ImportReadFailed: (failure) => {
      type ConcreteHandler = Assert<Equal<typeof failure, ImportReadFailed>>;
      const verified: ConcreteHandler = true;
      void verified;
      return failure.details.path;
    },
    ImportJsonInvalid: (failure) => {
      type ConcreteHandler = Assert<Equal<typeof failure, ImportJsonInvalid>>;
      const verified: ConcreteHandler = true;
      void verified;
      return failure.message.length;
    },
  });
}

export type MixedReturn = Assert<
  Equal<ReturnType<typeof mixedReturn>, string | number>
>;

export function asyncReturn(error: ImportFileError) {
  return error.match({
    ImportReadFailed: async (failure) => failure.details.path,
    ImportJsonInvalid: async (failure) => failure.message.length,
  });
}

export type AsyncReturn = Assert<
  Equal<ReturnType<typeof asyncReturn>, Promise<string> | Promise<number>>
>;

export function concreteReturn(error: PassageNotFound) {
  return error.match({
    PassageNotFound: (failure) => failure.details.passageId,
  });
}

export type ConcreteReturn = Assert<
  Equal<ReturnType<typeof concreteReturn>, string>
>;

export function distinctFields(error: ImportReadFailed | PassageNotFound) {
  return error.match({
    ImportReadFailed: (failure) => failure.details.path,
    PassageNotFound: (failure) => failure.details.passageId,
  });
}

export type DistinctFields = Assert<
  Equal<ReturnType<typeof distinctFields>, string>
>;

// Regression: Extract<E, {_tag: Tag}> incorrectly made these handlers never.
export function unionTag(tag: "Alpha" | "Beta") {
  class DynamicError extends Result.taggedError(tag)<{ value: string }> {}

  const result = new DynamicError({ value: "payload" }).match({
    Alpha: (failure) => {
      type Concrete = Assert<Equal<typeof failure, DynamicError>>;
      const verified: Concrete = true;
      void verified;
      return failure;
    },
    Beta: (failure) => {
      type Concrete = Assert<Equal<typeof failure, DynamicError>>;
      const verified: Concrete = true;
      void verified;
      return failure;
    },
  });

  type ReturnedClass = Assert<Equal<typeof result, DynamicError>>;
  const verified: ReturnedClass = true;
  void verified;
  return result;
}

// Widening one tag must not erase other possible concrete variants.
export function widenedTag(tag: string) {
  class DynamicError extends Result.taggedError(tag)<{ dynamic: number }> {}
  class StaticError extends Result.taggedError("Static")<{ static: string }> {}

  return function handle(error: DynamicError | StaticError) {
    return error.match({
      Static: (failure) => {
        type Possible = Assert<
          Equal<typeof failure, DynamicError | StaticError>
        >;
        const verified: Possible = true;
        void verified;
        return failure instanceof StaticError
          ? failure.details.static
          : failure.details.dynamic.toFixed();
      },
    });
  };
}
