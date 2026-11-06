# TypeScript Result Exploration

Four small workflows, each written three ways. The examples use the same
operations and success values so you can compare where the error-handling code
goes and what a caller can learn from the types.

| Example                                                        | Basic                                         | Result                                          | Better Result                                                   |
| -------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Read JSON, validate a manifest, and check source files         | [Basic](src/01%20Imports%20-%20Basic.ts)      | [Result](src/01%20Imports%20-%20Result.ts)      | [Better Result](src/01%20Imports%20-%20Better%20Result.ts)      |
| Parse a search, query an index, and format the page            | [Basic](src/02%20Search%20-%20Basic.ts)       | [Result](src/02%20Search%20-%20Result.ts)       | [Better Result](src/02%20Search%20-%20Better%20Result.ts)       |
| Format different failures and wrap an error with context       | [Basic](src/03%20Errors%20-%20Basic.ts)       | [Result](src/03%20Errors%20-%20Result.ts)       | [Better Result](src/03%20Errors%20-%20Better%20Result.ts)       |
| Insert a batch, roll back on failure, and close the connection | [Basic](src/04%20Transactions%20-%20Basic.ts) | [Result](src/04%20Transactions%20-%20Result.ts) | [Better Result](src/04%20Transactions%20-%20Better%20Result.ts) |

The [manifest and document schemas](src/support/import-data.ts) and
[in-memory search index](src/support/search-index.ts) are small stand-ins for
application code. File reads, JSON parsing, Zod validation, and SQLite are real.
The Better Result examples use the library directly.

## Basic TypeScript

Functions return values or native Promises. A failed step throws or rejects, so
a successful call gives you the value directly.

```ts
export async function loadManifest(path: string): Promise<Manifest> {
  const raw = await readJson(path);
  return manifestSchema.parse(raw);
}
```

This is the shortest success path. It also fits APIs that already throw, such as
JSON parsing and SQLite. If a caller wants to recover from a specific failure,
it needs a `catch` and runtime checks. TypeScript types `Promise<Manifest>` on
success and treats the caught value as `unknown`. A new throwing case can reach
callers without a compiler error.

You can attach context with `new Error(message, { cause })`. The original error
is available at runtime, and its static type is `unknown`. The import example
lets JSON and Zod errors propagate as-is. The two Result versions also attach
the input path to those failures.

## Small Result module

The local [Result module](src/result.ts) exposes `ok`, `err`, and a factory for
tagged Error subclasses. Async functions still use ordinary `async` and `await`.
A Promise fulfills with an `Ok` or `Err` for expected outcomes.

```ts
const text = await readText(path);
if (!text.ok) return text;

return parseJson(text.value, path);
```

The guard returns the original error and narrows the success value for the next
step. TypeScript preserves the union of possible errors as the steps compose. An
explicit public return type can give that union a readable name even when
TypeScript infers a more verbose shape.

The cost is a guard and a `.value` access at most fallible steps, plus ordinary
`try/catch` where a native API throws. The error factory keeps the stack and
native `cause`. It stores typed context, including any typed cause, in
`.details`. Its `.match()` checks that you handle every tag in a known union and
gives each handler the right error type. Use distinct literal tags to keep that
check. A tag widened to `string` loses exhaustiveness. Tags such as `toString`
that overlap inherited Object methods need a runtime check.

## Better Result

Better Result gives you typed success and error values, tagged errors, and
helpers for composing them. In the generator style, each `yield*` gives you the
success value or stops the workflow at the first `Err`. `Result.await` bridges
async steps.

```ts
return Result.gen(async function* () {
  const text = yield* Result.await(readText(path));
  return parseJson(text, path);
});
```

This is the railway-oriented pattern. The next step only runs after success. The
return type still includes the error types from every step, even though any one
run returns only the first failure. This buys a compact workflow, especially
when it has many steps. It also means learning the library's generator syntax
and helpers. For example, `tryPromise` wraps a rejecting operation, `mapError`
translates a failure, and tagged errors support exhaustive matching.

## Expected failures, defects, and cleanup

A missing file is an expected failure in these examples. A programming mistake
is a defect. With either Result style, expected failures appear in the error
union. The local module lets a defect that escapes the native-operation adapter
propagate unchanged. Better Result can wrap unexpected throws in `Panic` at its
composition boundaries, with the original exception as the cause. Its
transaction adapter also calls `panic` when an unexpected exception reaches it.
`Panic` is thrown and stays outside the expected error union. With Basic
TypeScript, both kinds of failure use the same exception channel. A broad catch
can handle or wrap either.

The transaction example shows where native exceptions fit particularly well.
SQLite already rolls back when its callback throws. A returned `Err` is a normal
return to SQLite, so both Result versions use a private throw inside their
adapter to trigger rollback and then return the original error. Both adapters
classify a `SQLiteError` that reaches their outer `catch` as
`TransactionFailed`. All three versions use the same `using` scope to close the
connection.

|                                         | Basic                               | Result                                   | Better Result                        |
| --------------------------------------- | ----------------------------------- | ---------------------------------------- | ------------------------------------ |
| Expected failures visible to the caller | Runtime checks in `catch`           | Typed error union                        | Typed error union                    |
| Compose multiple steps                  | Call or `await` directly            | Call or `await` and check `.ok`          | `yield*` and `Result.await`          |
| Handle individual errors                | Runtime narrowing                   | Exhaustive tagged match                  | Exhaustive tagged match              |
| Unexpected exception                    | Original throw unless caught        | Original throw unless caught             | Can become a thrown `Panic`          |
| What you take on                        | Error classification at catch sites | Repeated guards and a small local module | A dependency and its composition API |

## Run the examples

Use can use Bun. Each numbered file exports functions. The tests run all three
versions against synthetic inputs and in-memory databases.

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
```

The strict check includes [type probes](test/comparison-types.ts) for inferred
error unions. To see an exhaustive match fail, run
`bun check -p test/type-errors/tsconfig.json`. That separate check is supposed
to fail. It includes a new error with a missing handler, an extra handler, and a
handler trying to read another variant's fields.
