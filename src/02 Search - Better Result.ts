import { Result } from "better-result";
import {
  parseSearchExpression as parseExpression,
  projectPassage,
  search as queryIndex,
  SearchExpressionInvalid,
  SearchFailed,
  type SearchExpression,
  type SearchOptions,
  type SearchPage,
} from "./support/search-index.ts";

export function searchSources(
  indexName: string,
  query: string,
  options: SearchOptions = {},
) {
  return Result.gen(function* () {
    const expression = yield* parseSearchExpression(query);
    const page = yield* search(indexName, expression, options);

    return Result.ok({
      ...page,
      passages: page.passages.map(projectPassage),
    });
  });
}

function parseSearchExpression(
  query: string,
): Result<SearchExpression, SearchExpressionInvalid> {
  return Result.try({
    try: () => parseExpression(query),
    catch: (cause) => {
      if (!(cause instanceof SearchExpressionInvalid)) throw cause;
      return cause;
    },
  });
}

function search(
  indexName: string,
  query: SearchExpression,
  options: SearchOptions,
): Result<SearchPage, SearchFailed> {
  return Result.try({
    try: () => queryIndex(indexName, query, options),
    catch: (cause) => {
      if (!(cause instanceof SearchFailed)) throw cause;
      return cause;
    },
  });
}
