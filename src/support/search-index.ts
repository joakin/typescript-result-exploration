export type SearchOptions = {
  limit?: number;
  offset?: number;
  documentId?: string;
};

export type SearchExpression = readonly string[];

export type Passage = {
  id: string;
  documentId: string;
  text: string;
};

export type SearchPage = {
  passages: Passage[];
  total: number;
};

const notes: readonly Passage[] = [
  {
    id: "p1",
    documentId: "d1",
    text: "Collect evidence from multiple sources.",
  },
  {
    id: "p2",
    documentId: "d1",
    text: "Record evidence that challenges the claim.",
  },
  {
    id: "p3",
    documentId: "d2",
    text: "Explain the method in a short summary.",
  },
];

export class SearchExpressionInvalid extends Error {
  readonly query: string;

  constructor(query: string) {
    super("Enter one or more search words.");
    this.query = query;
  }
}

export function parseSearchExpression(query: string): SearchExpression {
  const expression = query.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:\s+[a-z0-9]+)*$/u.test(expression)) {
    throw new SearchExpressionInvalid(query);
  }
  return expression.split(/\s+/u);
}

export class SearchFailed extends Error {
  readonly indexName: string;

  constructor(indexName: string) {
    super(`Search index "${indexName}" is unavailable.`);
    this.indexName = indexName;
  }
}

export function search(
  indexName: string,
  expression: SearchExpression,
  { limit = 20, offset = 0, documentId }: SearchOptions = {},
): SearchPage {
  if (indexName !== "notes") throw new SearchFailed(indexName);

  const matching = notes.filter(
    (passage) =>
      (documentId === undefined || passage.documentId === documentId) &&
      expression.every((term) => passage.text.toLowerCase().includes(term)),
  );

  return {
    passages: matching.slice(offset, offset + limit),
    total: matching.length,
  };
}

export function projectPassage(passage: Passage) {
  return { id: passage.id, excerpt: passage.text };
}
