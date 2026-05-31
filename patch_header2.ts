import fs from "fs";
let code = fs.readFileSync("src/App.tsx", "utf-8");

code = code.replace(
  '<h1 className="text-3xl font-bold">Workspace</h1>\n              <EngineStatusPill />',
  '<h1 className="text-3xl font-bold">Workspace</h1>\n              <div className="flex items-center gap-2">\n                <SettingsDropdown />\n                <EngineStatusPill />\n              </div>'
);
fs.writeFileSync("src/App.tsx", code);
