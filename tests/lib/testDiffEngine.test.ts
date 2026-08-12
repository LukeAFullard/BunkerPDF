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

  it('should fallback to estimated dimensions for degenerate bounding boxes', async () => {
    const bytes1 = fs.readFileSync(getFixturePath('missing_highlight', 1));
    const tokens1 = await extractTokens(bytes1);

    // We already know some tokens will have fallback width because this is generated with a fallback guard now,
    // or we can test using our fallback directly. Wait! `extractTokens` has the fallback logic.
    // Let's assert that there are no NaN/0 widths.
    const hasZeroOrNaN = tokens1.some(t => !t.width || t.width === 0 || Number.isNaN(t.width) || !t.height || t.height === 0 || Number.isNaN(t.height));
    expect(hasZeroOrNaN).toBe(false);

    // It should contain the text from the missing highlight fixture
    const foundTokens = tokens1.filter(t => t.text.includes('4th') || t.text.includes('step') || t.text.includes('Reconstruction'));
    expect(foundTokens.length).toBeGreaterThan(0);

    const bytes2 = fs.readFileSync(getFixturePath('missing_highlight', 2));
    const tokens2 = await extractTokens(bytes2);

    // Make sure the diff Engine picks up the changes
    const diffChunks = diffTokens(tokens1, tokens2);

    // Verify that the chunk containing 'Reconstruction' is 'removed'
    const removedChunk = diffChunks.find(c => c.type === 'removed' && c.tokens.some(t => t.text.includes('Reconstruction')));
    expect(removedChunk).toBeDefined();

    // Verify coordinates of the token in the chunk are valid
    const targetToken = removedChunk!.tokens.find(t => t.text.includes('Reconstruction'));
    expect(targetToken!.width).toBeGreaterThan(0);
    expect(targetToken!.height).toBeGreaterThan(0);
    expect(Number.isNaN(targetToken!.x)).toBe(false);
    expect(Number.isNaN(targetToken!.y)).toBe(false);
  });
});
