import {
  parseSearchExpression,
  projectPassage,
  search,
  type SearchOptions,
} from "./support/search-index.ts";

export function searchSources(
  indexName: string,
  query: string,
  options: SearchOptions = {},
) {
  const expression = parseSearchExpression(query);
  const page = search(indexName, expression, options);

  return {
    ...page,
    passages: page.passages.map(projectPassage),
  };
}
