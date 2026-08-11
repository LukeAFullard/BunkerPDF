import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm?url', () => {
  return {
    default: fs.readFileSync(path.resolve(__dirname, '../node_modules/@llamaindex/liteparse-wasm/pkg/liteparse_wasm_bg.wasm'))
  };
});

if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {
    constructor() {}
  } as unknown;
}
