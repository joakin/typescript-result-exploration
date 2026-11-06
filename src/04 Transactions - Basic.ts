import type { Database } from "bun:sqlite";

// The transaction rolls back a failed batch. The caller owns the connection.
export function insertValues(database: Database, values: readonly number[]) {
  return database
    .transaction(() => {
      for (const value of values) {
        insertOne(database, value);
      }

      return { inserted: values.length };
    })
    .immediate();
}

// These examples explicitly take ownership of the supplied disposable handle.
export function insertAndClose(database: Database, values: readonly number[]) {
  using connection = database;
  return insertValues(connection, values);
}

function insertOne(database: Database, value: number): void {
  const sql = "INSERT INTO probe(value) VALUES (:value)";
  database.query<unknown, { value: number }>(sql).run({ value });
}
