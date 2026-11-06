import {
  SearchExpressionInvalid,
  SearchFailed,
} from "../src/support/search-index.ts";
import { Database, SQLiteError } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isPanic } from "better-result";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rejects, throws } from "node:assert/strict";
import {
  loadImport as loadImportBasic,
  loadManifest as loadManifestBasic,
} from "../src/01 Imports - Basic.ts";
import {
  loadImport as loadImportBetter,
  loadManifest as loadManifestBetter,
} from "../src/01 Imports - Better Result.ts";
import {
  loadImport as loadImportPlain,
  loadManifest as loadManifestPlain,
  type ImportError,
} from "../src/01 Imports - Result.ts";
import { searchSources as searchSourcesBetter } from "../src/02 Search - Better Result.ts";
import { searchSources as searchSourcesBasic } from "../src/02 Search - Basic.ts";
import { searchSources as searchSourcesPlain } from "../src/02 Search - Result.ts";
import {
  prepareSource as prepareSourceBasic,
  describeSource as describeSourceBasic,
} from "../src/03 Errors - Basic.ts";
import {
  prepareSource as prepareSourceBetter,
  describeSource as describeSourceBetter,
} from "../src/03 Errors - Better Result.ts";
import {
  prepareSource as prepareSourcePlain,
  describeSource as describeSourcePlain,
} from "../src/03 Errors - Result.ts";
import {
  insertValues as insertValuesBetter,
  insertAndClose as insertAndCloseBetter,
  writeTransaction as writeTransactionBetter,
} from "../src/04 Transactions - Better Result.ts";
import {
  insertValues as insertValuesBasic,
  insertAndClose as insertAndCloseBasic,
} from "../src/04 Transactions - Basic.ts";
import {
  insertValues as insertValuesPlain,
  insertAndClose as insertAndClosePlain,
  writeTransaction as writeTransactionPlain,
} from "../src/04 Transactions - Result.ts";

async function withDirectory(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "result-comparison-check-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("read-and-validate comparisons and complete import retain successful payloads", async () => {
  await withDirectory(async (directory) => {
    const fixture = await createFixture(directory);
    const currentManifest = await loadManifestBetter(fixture.manifestPath);
    const plainManifest = await loadManifestPlain(fixture.manifestPath);
    if (currentManifest.isErr() || !plainManifest.ok)
      throw new Error("Expected manifest success");
    expect(plainManifest.value).toEqual(currentManifest.value);
    expect(await loadManifestBasic(fixture.manifestPath)).toEqual(
      currentManifest.value,
    );

    const better = await loadImportBetter(fixture.manifestPath);
    const plain = await loadImportPlain(fixture.manifestPath);
    if (better.isErr() || !plain.ok) throw new Error("Expected import success");
    expect(better.value.document.title).toBe("Research notes");
    expect(plain.value).toEqual(better.value);
    expect(await loadImportBasic(fixture.manifestPath)).toEqual(better.value);
  });
});

async function createFixture(directory: string) {
  const pdf = new TextEncoder().encode("%PDF-1.7\nSynthetic test bytes");
  const sha256 = createHash("sha256").update(pdf).digest("hex");

  const manifest = {
    sourcePdf: "notes.pdf",
    structuredDocument: "notes.json",
    sourceSha256: sha256,
  };
  const document = {
    title: "Research notes",
    source: { sha256, byteLength: pdf.byteLength },
    sections: ["Check the original sources."],
  };

  const manifestPath = join(directory, "manifest.json");
  const documentPath = join(directory, manifest.structuredDocument);
  await Bun.write(join(directory, manifest.sourcePdf), pdf);
  await Bun.write(documentPath, JSON.stringify(document));
  await Bun.write(manifestPath, JSON.stringify(manifest));

  return { manifest, manifestPath, documentPath };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const invalidImports: {
  name: string;
  tag: ImportError["_tag"];
  change: (fixture: Fixture, directory: string) => Promise<unknown>;
}[] = [
  {
    name: "missing manifest",
    tag: "ImportReadFailed",
    change: (fixture) => rm(fixture.manifestPath),
  },
  {
    name: "malformed manifest JSON",
    tag: "ImportJsonInvalid",
    change: (fixture) => Bun.write(fixture.manifestPath, "{"),
  },
  {
    name: "invalid manifest schema",
    tag: "ImportValidationFailed",
    change: (fixture) => Bun.write(fixture.manifestPath, "{}"),
  },
  {
    name: "missing structured document",
    tag: "ImportReadFailed",
    change: (fixture) => rm(fixture.documentPath),
  },
  {
    name: "malformed structured JSON",
    tag: "ImportJsonInvalid",
    change: (fixture) => Bun.write(fixture.documentPath, "{"),
  },
  {
    name: "invalid document schema",
    tag: "ImportValidationFailed",
    change: (fixture) => Bun.write(fixture.documentPath, "{}"),
  },
  {
    name: "missing PDF",
    tag: "ImportReadFailed",
    change: (fixture, directory) =>
      rm(join(directory, fixture.manifest.sourcePdf)),
  },
  {
    name: "mismatched PDF identity",
    tag: "SourceIdentityMismatch",
    change: (fixture, directory) =>
      Bun.write(join(directory, fixture.manifest.sourcePdf), "changed"),
  },
];

for (const { name, tag, change } of invalidImports) {
  test(`full import agrees on the failure kind: ${name}`, async () => {
    await withDirectory(async (directory) => {
      const fixture = await createFixture(directory);
      await change(fixture, directory);
      const better = await loadImportBetter(fixture.manifestPath);
      const plain = await loadImportPlain(fixture.manifestPath);
      if (better.isOk() || plain.ok)
        throw new Error("Expected all Result-based imports to fail");
      expect(better.error._tag).toBe(tag);
      expect(plain.error._tag).toBe(tag);
      expect(plain.error.details.path).toBe(better.error.path);

      const path = better.error.path;
      const exception = {
        ImportReadFailed: { code: "ENOENT", path },
        ImportJsonInvalid: { name: "SyntaxError" },
        ImportValidationFailed: { name: "ZodError" },
        SourceIdentityMismatch: {
          message: `Source identity mismatch for ${path}.`,
        },
      }[tag];
      await rejects(loadImportBasic(fixture.manifestPath), exception);
    });
  });
}

test("search comparisons preserve pagination, projections, filters, and parser-first failure", () => {
  for (const { options, ids, total } of [
    { options: {}, ids: ["p1", "p2"], total: 2 },
    { options: { limit: 1 }, ids: ["p1"], total: 2 },
    { options: { limit: 1, offset: 1 }, ids: ["p2"], total: 2 },
    { options: { documentId: "unknown" }, ids: [], total: 0 },
  ]) {
    const current = searchSourcesBetter("notes", "evidence", options);
    const plain = searchSourcesPlain("notes", "evidence", options);
    if (current.isErr() || !plain.ok)
      throw new Error("Expected search success");
    expect(current.value.passages.map((passage) => passage.id)).toEqual(ids);
    expect(current.value.total).toBe(total);
    expect(plain.value).toEqual(current.value);
    expect(searchSourcesBasic("notes", "evidence", options)).toEqual(
      current.value,
    );
  }

  const absent = "missing-index";
  for (const { query, expected } of [
    { query: "(", expected: SearchExpressionInvalid },
    { query: "evidence", expected: SearchFailed },
  ]) {
    const better = searchSourcesBetter(absent, query);
    const plain = searchSourcesPlain(absent, query);
    if (better.isOk() || plain.ok) throw new Error("Expected search to fail");
    expect(better.error).toBeInstanceOf(expected);
    expect(plain.error).toBeInstanceOf(expected);
    throws(() => searchSourcesBasic(absent, query), expected);
  }
});

test("error wrappers preserve causes and all three versions produce the same text", async () => {
  await withDirectory(async (directory) => {
    const path = join(directory, "source.json");
    for (const content of [undefined, "{", "null"]) {
      if (content !== undefined) await Bun.write(path, content);
      const description = await describeSourceBetter(path);
      expect(await describeSourcePlain(path)).toBe(description);
      expect(await describeSourceBasic(path)).toBe(description);
      const current = await prepareSourceBetter(path);
      const plain = await prepareSourcePlain(path);
      expect(plain.ok).toBe(current.isOk());
      if (current.isErr() && !plain.ok) {
        expect(plain.error._tag).toBe(current.error._tag);
        expect(plain.error.details.cause._tag).toBe(current.error.cause._tag);
        expect(plain.error.cause).toBe(plain.error.details.cause);
        await rejects(prepareSourceBasic(path), (failure: unknown) => {
          if (!(failure instanceof Error) || !(failure.cause instanceof Error))
            return false;
          expect(failure.message).toBe(`Cannot prepare source ${path}.`);
          expect(failure.cause.message).toBe(current.error.cause.message);
          return true;
        });
      } else if (current.isOk()) {
        expect(await prepareSourceBasic(path)).toEqual(current.value);
      }
    }
    for (const unreadable of [directory, "", "invalid\0path"]) {
      expect(await describeSourceBasic(unreadable)).toBe(
        await describeSourceBetter(unreadable),
      );
    }
  });
});

test("transaction comparisons commit success and roll back the complete failed batch", () => {
  using currentDb = new Database(":memory:", { strict: true });
  using plainDb = new Database(":memory:", { strict: true });
  using basicDb = new Database(":memory:", { strict: true });
  for (const database of [currentDb, plainDb, basicDb])
    database.run("CREATE TABLE probe(value INTEGER UNIQUE) STRICT");
  const current = insertValuesBetter(currentDb, [1, 2]);
  const plain = insertValuesPlain(plainDb, [1, 2]);
  if (current.isErr() || !plain.ok) throw new Error("Expected insert success");
  expect(plain.value).toEqual(current.value);
  expect(insertValuesBasic(basicDb, [1, 2])).toEqual(current.value);
  expect(insertValuesBetter(currentDb, [3, 1])).toMatchObject({
    status: "error",
    error: { _tag: "SqliteStatementFailed" },
  });
  expect(insertValuesPlain(plainDb, [3, 1])).toMatchObject({
    ok: false,
    error: { _tag: "SqliteStatementFailed" },
  });
  throws(() => insertValuesBasic(basicDb, [3, 1]), SQLiteError);
  for (const database of [currentDb, plainDb, basicDb]) {
    expect(
      database
        .query<unknown, []>("SELECT value FROM probe ORDER BY value")
        .all(),
    ).toEqual([{ value: 1 }, { value: 2 }]);
    expect(database.inTransaction).toBe(false);
  }
});

test("transaction defects roll back in both versions, with explicit Panic versus raw-throw difference", () => {
  using currentDb = new Database(":memory:", { strict: true });
  using plainDb = new Database(":memory:", { strict: true });
  const defect = new TypeError("Authored defect");
  for (const database of [currentDb, plainDb])
    database.run("CREATE TABLE probe(value INTEGER) STRICT");
  throws(
    () =>
      writeTransactionBetter(currentDb, () => {
        currentDb.run("INSERT INTO probe VALUES (1)");
        throw defect;
      }),
    (cause: unknown) => isPanic(cause) && cause.cause === defect,
  );
  throws(
    () =>
      writeTransactionPlain(plainDb, () => {
        plainDb.run("INSERT INTO probe VALUES (1)");
        throw defect;
      }),
    (cause: unknown) => cause === defect,
  );
  for (const database of [currentDb, plainDb])
    expect(
      database.query<unknown, []>("SELECT value FROM probe").all(),
    ).toEqual([]);
});

test("using closes connections after returned errors and thrown exceptions", () => {
  const currentDb = new Database(":memory:", { strict: true });
  const plainDb = new Database(":memory:", { strict: true });
  const basicDb = new Database(":memory:", { strict: true });
  for (const database of [currentDb, plainDb, basicDb])
    database.run("CREATE TABLE probe(value INTEGER UNIQUE) STRICT");
  expect(insertAndCloseBetter(currentDb, [1, 1]).isErr()).toBe(true);
  expect(insertAndClosePlain(plainDb, [1, 1]).ok).toBe(false);
  throws(() => insertAndCloseBasic(basicDb, [1, 1]), SQLiteError);
  for (const database of [currentDb, plainDb, basicDb])
    expect(() => database.query("SELECT 1")).toThrow(/closed/u);
});
