import fs from "fs";
let code = fs.readFileSync("src/App.tsx", "utf-8");

code = code.replace(
  '<SettingsDropdown />\n            </div>\n          </header>',
  '<SettingsDropdown />\n              <EngineStatusPill />\n            </div>\n          </header>'
);
fs.writeFileSync("src/App.tsx", code);
