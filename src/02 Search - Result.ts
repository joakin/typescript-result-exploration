import { Result } from "./result.ts";
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
  const expression = parseSearchExpression(query);
  if (!expression.ok) return expression;

  const page = search(indexName, expression.value, options);
  if (!page.ok) return page;

  return Result.ok({
    ...page.value,
    passages: page.value.passages.map(projectPassage),
  });
}

function parseSearchExpression(
  query: string,
): Result<SearchExpression, SearchExpressionInvalid> {
  try {
    return Result.ok(parseExpression(query));
  } catch (cause) {
    if (!(cause instanceof SearchExpressionInvalid)) throw cause;
    return Result.err(cause);
  }
}

function search(
  indexName: string,
  query: SearchExpression,
  options: SearchOptions,
): Result<SearchPage, SearchFailed> {
  try {
    return Result.ok(queryIndex(indexName, query, options));
  } catch (cause) {
    if (!(cause instanceof SearchFailed)) throw cause;
    return Result.err(cause);
  }
}
