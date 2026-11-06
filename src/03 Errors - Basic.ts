import { readJson } from "./01 Imports - Basic.ts";

export async function prepareSource(path: string): Promise<unknown> {
  try {
    return await readJson(path);
  } catch (cause) {
    throw new Error(`Cannot prepare source ${path}.`, { cause });
  }
}

export async function describeSource(path: string): Promise<string> {
  try {
    await readJson(path);
    return "Loaded JSON.";
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      return `Invalid JSON in ${path}: ${cause.message}`;
    }

    if (
      cause instanceof Error &&
      "code" in cause &&
      typeof cause.code === "string"
    ) {
      return `Cannot read ${path}: ${cause.message}`;
    }

    throw cause;
  }
}
