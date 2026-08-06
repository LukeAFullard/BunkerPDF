import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, '../test-fixtures/tables');

// Memory instruction: "When testing or initializing `@llamaindex/liteparse-wasm` in standalone Node.js scripts (outside Vite), explicitly read the `.wasm` file using `fs.readFileSync` and pass it to the default `init()` function to prevent `fetch` and path resolution errors."

// Mock the Vite-specific ?url import so it doesn't break
vi.mock('@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm?url', () => {
  return { default: '' };
});

const wasmPath = path.resolve(__dirname, '../node_modules/@llamaindex/liteparse-wasm/pkg/liteparse_wasm_bg.wasm');
const wasmBuffer = fs.readFileSync(wasmPath);

vi.mock('@llamaindex/liteparse-wasm', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: async () => {
      // Pass the raw buffer directly to init() as per memory instructions
      return await actual.default(wasmBuffer);
    }
  };
});

import { extractTablesLiteparse } from '../src/lib/liteparseEngine'; // adjust path if needed

const fixtures = [
  '01-noisy-lines-fee-schedule',
  '02-spanning-rows-water-temp',
  '03-colored-header-bands',
  '04-plain-control-table',
  '05-wrapped-cells-header-band',
  '06-multi-section-header-bands',
  '07-no-lines-wrapped',
  '08-split-spanning-label',
  '09-caption-partial-rule'
];

for (const fixture of fixtures) {
  test(`Table extraction for ${fixture}`, async () => {
    const pdfPath = path.join(FIXTURES_DIR, `${fixture}.pdf`);
    const expectedPath = path.join(FIXTURES_DIR, `${fixture}.expected.md`);

    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Missing fixture PDF: ${pdfPath}`);
    }

    const bytes = new Uint8Array(fs.readFileSync(pdfPath));
    const extractedMarkdown = await extractTablesLiteparse(bytes, 'markdown');

    if (!fs.existsSync(expectedPath)) {
      console.warn(`No expected file found for ${fixture}. Generating one at ${expectedPath}`);
      fs.writeFileSync(expectedPath, extractedMarkdown, 'utf-8');
    }

    const expectedMarkdown = fs.readFileSync(expectedPath, 'utf-8');
    expect(extractedMarkdown).toEqual(expectedMarkdown);
  });
}
