with open("liteparse_v2_new_features_report.md", "r") as f:
    content = f.read()

old_action = "*   **Action:** Request the `json` output from LiteParse, which gives us everything (`textItems`, `vectorGraphics`, `images`, `metadata`), and build a **custom Markdown renderer** in TypeScript. This gives us absolute control: we can inject our superior `formatTableFromItems` logic for tables, base64 data URIs for `extractImages` exactly where they appear vertically, and format text using precise `extractTextMetadata` tags."

new_action = "*   [x] **Action:** Request the `json` output from LiteParse, which gives us everything (`textItems`, `vectorGraphics`, `images`, `metadata`), and build a **custom Markdown renderer** in TypeScript. This gives us absolute control: we can inject our superior `formatTableFromItems` logic for tables, base64 data URIs for `extractImages` exactly where they appear vertically, and format text using precise `extractTextMetadata` tags."

content = content.replace(old_action, new_action)

with open("liteparse_v2_new_features_report.md", "w") as f:
    f.write(content)
