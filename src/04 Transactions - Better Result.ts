import { SQLiteError, type Database } from "bun:sqlite";
import { isPanic, panic, Result, TaggedError } from "better-result";

// The transaction rolls back a failed batch. The caller owns the connection.
export function insertValues(database: Database, values: readonly number[]) {
  return writeTransaction(database, () =>
    Result.gen(function* () {
      for (const value of values) {
        yield* insertOne(database, value);
      }

      return Result.ok({ inserted: values.length });
    }),
  );
}

// These examples explicitly take ownership of the supplied disposable handle.
export function insertAndClose(database: Database, values: readonly number[]) {
  using connection = database;
  return insertValues(connection, values);
}

export class TransactionFailed extends TaggedError("TransactionFailed")<{
  cause: SQLiteError;
  message: string;
}> {}

export function writeTransaction<T, E>(
  database: Database,
  work: () => Result<T, E>,
): Result<T, E | TransactionFailed> {
  const rollback = new Error("Rollback a returned error result.");
  let rejected: Result<T, E> | undefined;

  try {
    return database
      .transaction(() => {
        const result = work();
        if (result.isErr()) {
          rejected = result;
          throw rollback;
        }

        return result;
      })
      .immediate();
  } catch (cause) {
    if (cause === rollback && rejected !== undefined) return rejected;
    if (isPanic(cause)) throw cause;
    if (!(cause instanceof SQLiteError)) {
      panic("Unexpected failure in a transaction callback.", cause);
    }
    return Result.err(new TransactionFailed({ cause, message: cause.message }));
  }
}

export class SqliteStatementFailed extends TaggedError(
  "SqliteStatementFailed",
)<{
  sql: string;
  cause: SQLiteError;
  message: string;
}> {}

function insertOne(
  database: Database,
  value: number,
): Result<void, SqliteStatementFailed> {
  const sql = "INSERT INTO probe(value) VALUES (:value)";
  try {
    database.query<unknown, { value: number }>(sql).run({ value });
    return Result.ok();
  } catch (cause) {
    if (!(cause instanceof SQLiteError)) throw cause;
    return Result.err(
      new SqliteStatementFailed({ sql, cause, message: cause.message }),
    );
  }
}
