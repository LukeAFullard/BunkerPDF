import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { extractTokens, diffTokens, DiffChunk } from '../../src/lib/diffEngine';

const getFixturePath = (name: string, version: number) =>
  path.join(__dirname, '..', '..', 'test-fixtures', 'diff', `${name}_v${version}.pdf`);

// A helper to strip coordinates from DiffChunks for cleaner snapshot matching
const stripCoords = (chunks: DiffChunk[]) => {
  return chunks.map(chunk => ({
    type: chunk.type,
    tokens: chunk.tokens.map(t => t.text)
  }));
};

describe('Diff Engine Attribution Tests', () => {
  it('should handle mid-paragraph insertion', async () => {
    const bytes1 = fs.readFileSync(getFixturePath('insertion', 1));
    const bytes2 = fs.readFileSync(getFixturePath('insertion', 2));

    const tokens1 = await extractTokens(bytes1);
    const tokens2 = await extractTokens(bytes2);

    const diffChunks = diffTokens(tokens1, tokens2);
    expect(stripCoords(diffChunks)).toMatchInlineSnapshot(`
      [
        {
          "tokens": [
            "This",
            "is",
            "a",
          ],
          "type": "unchanged",
        },
        {
          "tokens": [
            "very",
          ],
          "type": "added",
        },
        {
          "tokens": [
            "simple",
            "sentence.",
          ],
          "type": "unchanged",
        },
      ]
    `);
  });

  it('should handle mid-paragraph deletion', async () => {
    const bytes1 = fs.readFileSync(getFixturePath('deletion', 1));
    const bytes2 = fs.readFileSync(getFixturePath('deletion', 2));

    const tokens1 = await extractTokens(bytes1);
    const tokens2 = await extractTokens(bytes2);

    const diffChunks = diffTokens(tokens1, tokens2);
    expect(stripCoords(diffChunks)).toMatchInlineSnapshot(`
      [
        {
          "tokens": [
            "The",
            "quick",
          ],
          "type": "unchanged",
        },
        {
          "tokens": [
            "brown",
          ],
          "type": "removed",
        },
        {
          "tokens": [
            "fox",
            "jumps",
            "over",
            "the",
            "lazy",
            "dog.",
          ],
          "type": "unchanged",
        },
      ]
    `);
  });

  it('should correctly handle punctuation splits in tokens', async () => {
    const bytes1 = fs.readFileSync(getFixturePath('punctuation', 1));
    const bytes2 = fs.readFileSync(getFixturePath('punctuation', 2));

    const tokens1 = await extractTokens(bytes1);
    const tokens2 = await extractTokens(bytes2);

    const diffChunks = diffTokens(tokens1, tokens2);
    expect(stripCoords(diffChunks)).toMatchInlineSnapshot(`
      [
        {
          "tokens": [
            "Hello",
            "world",
          ],
          "type": "removed",
        },
        {
          "tokens": [
            "Hello,",
            "world!",
          ],
          "type": "added",
        },
      ]
    `);
  });

  it('should correctly handle moved paragraphs', async () => {
    const bytes1 = fs.readFileSync(getFixturePath('moved_paragraph', 1));
    const bytes2 = fs.readFileSync(getFixturePath('moved_paragraph', 2));

    const tokens1 = await extractTokens(bytes1);
    const tokens2 = await extractTokens(bytes2);

    const diffChunks = diffTokens(tokens1, tokens2);
    expect(stripCoords(diffChunks)).toMatchInlineSnapshot(`
      [
        {
          "tokens": [
            "First",
          ],
          "type": "removed",
        },
        {
          "tokens": [
            "Second",
          ],
          "type": "added",
        },
        {
          "tokens": [
            "paragraph",
            "here.",
          ],
          "type": "unchanged",
        },
        {
          "tokens": [
            "Second",
          ],
          "type": "removed",
        },
        {
          "tokens": [
            "First",
          ],
          "type": "added",
        },
        {
          "tokens": [
            "paragraph",
            "here.",
          ],
          "type": "unchanged",
        },
      ]
    `);
  });
});
