import * as fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. Imports
content = content.replace(
  'import { convertImagesToPdf } from "./lib/engineA";',
  'import { convertImagesToPdf } from "./lib/engineA";\nimport { SettingsDropdown } from "./components/ui/SettingsDropdown";\nimport { extractTextLiteparse } from "./lib/liteparseEngine";'
);

// 2. extractText
content = content.replace(
  'const extractText = (bytes: Uint8Array): Promise<string> => {\n    return new Promise((resolve, reject) => {',
  `const extractText = (bytes: Uint8Array): Promise<string> => {\n    const method = useUIStore.getState().extractionMethod;\n    if (method === 'liteparse') {\n      return extractTextLiteparse(bytes);\n    }\n    return new Promise((resolve, reject) => {`
);

// 3. extractAllPagesText
content = content.replace(
  'const extractAllPagesText = (bytes: Uint8Array, pageCount: number): Promise<string[]> => {\n    return new Promise((resolve, reject) => {',
  `const extractAllPagesText = (bytes: Uint8Array, pageCount: number): Promise<string[]> => {\n    const method = useUIStore.getState().extractionMethod;\n    if (method === 'liteparse') {\n      return extractTextLiteparse(bytes).then(text => [text]);\n    }\n    return new Promise((resolve, reject) => {`
);

// 4. Header status pill
content = content.replace(
  '<EngineStatusPill />\n          </header>',
  '<div className="flex gap-2 items-center">\n              <EngineStatusPill />\n              <SettingsDropdown />\n            </div>\n          </header>'
);

// 5. Workspace status pill
content = content.replace(
  '<h1 className="text-3xl font-bold">Workspace</h1>\n              <EngineStatusPill />\n            </div>',
  '<h1 className="text-3xl font-bold">Workspace</h1>\n              <div className="flex items-center gap-2">\n                <EngineStatusPill />\n                <SettingsDropdown />\n              </div>\n            </div>'
);

// 6. Recipe extract-text
content = content.replace(
  'const text = await extractText(new Uint8Array(buffer));',
  'let text = "";\n               if (useUIStore.getState().extractionMethod === \'liteparse\') {\n                 text = await extractTextLiteparse(new Uint8Array(buffer));\n               } else {\n                 text = await extractText(new Uint8Array(buffer));\n               }'
);


fs.writeFileSync('src/App.tsx', content);
