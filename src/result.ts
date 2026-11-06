export type Ok<T> = { readonly ok: true; readonly value: T };

export type Err<E> = { readonly ok: false; readonly error: E };

export type Result<T, E> = Ok<T> | Err<E>;

function ok(): Ok<void>;
function ok<T>(value: T): Ok<T>;
function ok<T>(value?: T): Ok<T | undefined> {
  return { ok: true, value };
}

function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

type Tagged = { readonly _tag: string };

type Variant<E extends Tagged, Tag extends string> = E extends unknown
  ? [Tag & E["_tag"]] extends [never]
    ? never
    : E
  : never;

type Handlers<E extends Tagged> = {
  [Tag in E["_tag"]]: (error: Variant<E, Tag>) => unknown;
};

type MatchReturn<H> = {
  [Tag in keyof H]: H[Tag] extends (error: never) => infer R ? R : never;
}[keyof H];

abstract class MatchableError extends Error {
  abstract readonly _tag: string;

  match<E extends Tagged, const H extends Handlers<E>>(
    this: E,
    handlers: H & Record<Exclude<keyof H, E["_tag"]>, never>,
  ): MatchReturn<H> {
    const tag: E["_tag"] = this._tag;
    // Exhaustive keys and Variant tie each handler to its tag. TypeScript loses
    // that correlation at this dynamic lookup; keep the assertion local.
    const handler = Object.hasOwn(handlers, tag)
      ? (handlers[tag] as (error: E) => MatchReturn<H>)
      : undefined;
    if (typeof handler !== "function") {
      throw new TypeError(`Missing error handler for ${tag}.`);
    }
    return handler(this);
  }
}

function taggedError<const Tag extends string>(tag: Tag) {
  return class TaggedError<Details extends object> extends MatchableError {
    override readonly _tag = tag;
    readonly details: Readonly<Details>;

    constructor(details: Details) {
      const message =
        "message" in details && typeof details.message === "string"
          ? details.message
          : tag;
      const options = "cause" in details ? { cause: details.cause } : undefined;

      super(message, options);
      this.name = tag;
      this.details = details;
    }
  };
}

export const Result = { ok, err, taggedError };
