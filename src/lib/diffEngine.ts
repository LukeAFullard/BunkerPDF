import * as diff from 'diff';
import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import { getConfiguredLiteParse } from './liteparseEngine';

export interface Token {
  text: string;       // the word, as-is
  page: number;       // 0-indexed page number
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiffChunk {
  type: 'added' | 'removed' | 'unchanged';
  tokens: Token[];
}

export const extractTokens = async (bytes: Uint8Array): Promise<Token[]> => {
  const engine = await getConfiguredLiteParse({ outputFormat: 'json' });
  const result = await engine.parse(bytes);
  if (!result?.pages) return [];

  const tokens: Token[] = [];

  for (let pageIdx = 0; pageIdx < result.pages.length; pageIdx++) {
    const page = result.pages[pageIdx];
    if (!page.textItems) continue;

    for (const item of page.textItems) {
      // Split by whitespace and filter out empty strings
      const words = item.text.split(/(\s+)/).filter((w: string) => w.trim().length > 0);
      if (words.length === 0) continue;

      const totalChars = words.reduce((sum: number, w: string) => sum + w.length, 0) || 1;
      let cursorX = item.x;

      for (const word of words) {
        const wordWidth = (word.length / totalChars) * item.width;
        tokens.push({
          text: word,
          page: pageIdx,
          x: cursorX,
          y: item.y,
          width: wordWidth,
          height: item.height,
        });
        cursorX += wordWidth;
      }
    }
  }

  return tokens;
};

const normalize = (s: string) =>
  s.trim().toLowerCase()
    .replace(/[""]/g, '"').replace(/['']/g, "'")   // smart quotes
    .replace(/[‐‑‒–—]/g, '-')                        // dash variants
    .replace(/\s+/g, ' ');

export const diffTokens = (tokens1: Token[], tokens2: Token[]): DiffChunk[] => {
  const changes = diff.diffArrays(tokens1, tokens2, {
    comparator: (a: Token, b: Token) => normalize(a.text) === normalize(b.text),
  });

  return changes.map(change => ({
    type: change.added ? 'added' : change.removed ? 'removed' : 'unchanged',
    tokens: change.value as Token[],
  }));
};

export const highlightDiff = async (
  bytes1: Uint8Array,
  bytes2: Uint8Array,
  chunks: DiffChunk[]
): Promise<{ doc1: Uint8Array; doc2: Uint8Array }> => {
  const pdf1 = await PDFDocument.load(bytes1, { ignoreEncryption: true });
  const pdf2 = await PDFDocument.load(bytes2, { ignoreEncryption: true });
  const pages1 = pdf1.getPages();
  const pages2 = pdf2.getPages();

  const draw = (token: Token, page: PDFPage, color: [number, number, number]) => {
    const { height } = page.getSize();
    page.drawRectangle({
      x: token.x,
      y: height - token.y - token.height, // LiteParse is top-left origin, pdf-lib is bottom-left
      width: token.width,
      height: token.height,
      color: rgb(...color),
      opacity: 0.45,
    });
  };

  for (const chunk of chunks) {
    if (chunk.type === 'removed') {
      for (const t of chunk.tokens) draw(t, pages1[t.page], [1, 0.4, 0.4]);   // red
    } else if (chunk.type === 'added') {
      for (const t of chunk.tokens) draw(t, pages2[t.page], [0.4, 1, 0.4]);   // green
    }
  }

  return { doc1: await pdf1.save(), doc2: await pdf2.save() };
};

export const mergeHighlighted = async (doc1Bytes: Uint8Array, doc2Bytes: Uint8Array): Promise<Uint8Array> => {
  const merged = await PDFDocument.create();
  const src1 = await PDFDocument.load(doc1Bytes);
  const src2 = await PDFDocument.load(doc2Bytes);

  const pages1 = await merged.copyPages(src1, src1.getPageIndices());
  pages1.forEach(p => merged.addPage(p));
  const pages2 = await merged.copyPages(src2, src2.getPageIndices());
  pages2.forEach(p => merged.addPage(p));

  return merged.save();
};
