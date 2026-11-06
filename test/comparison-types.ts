import type { Err } from "../src/result.ts";
import type {
  ImportReadFailed,
  ImportJsonInvalid,
} from "../src/01 Imports - Result.ts";
import type {
  loadManifest,
  ImportValidationFailed,
} from "../src/01 Imports - Result.ts";
import type { searchSources } from "../src/02 Search - Result.ts";
import type {
  insertValues,
  SqliteStatementFailed,
  TransactionFailed,
} from "../src/04 Transactions - Result.ts";
import type {
  SearchFailed,
  SearchExpressionInvalid,
} from "../src/support/search-index.ts";

type ErrorOf<R> = R extends Err<infer E> ? E : never;

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

type Assert<T extends true> = T;

export type ManifestErrorUnion = Assert<
  Equal<
    ErrorOf<Awaited<ReturnType<typeof loadManifest>>>,
    ImportReadFailed | ImportJsonInvalid | ImportValidationFailed
  >
>;

export type SearchFailedUnion = Assert<
  Equal<
    ErrorOf<ReturnType<typeof searchSources>>,
    SearchFailed | SearchExpressionInvalid
  >
>;

export type TransactionErrorUnion = Assert<
  Equal<
    ErrorOf<ReturnType<typeof insertValues>>,
    SqliteStatementFailed | TransactionFailed
  >
>;
