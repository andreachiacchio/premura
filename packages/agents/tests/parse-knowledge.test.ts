import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_PARSER_VERSION } from '../src/knowledge-parser/parse-knowledge';

// Slice G — Test versione + invariants pure (no API call).

describe('KNOWLEDGE_PARSER_VERSION', () => {
  it("e' una stringa non vuota", () => {
    expect(KNOWLEDGE_PARSER_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-v\d+$/);
  });
});
