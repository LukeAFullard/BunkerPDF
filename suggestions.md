1. **Provide a Preview Before Extracting/Splitting Pages**: When a user wants to split or extract pages, show a visual preview of the pages. Allow them to specify page ranges (e.g., 1-5, 8-10) instead of just bursting the entire document. This adds more control and reduces errors.

2. **Add Confidence Scores and Page Selection to Table Extraction**: Table extraction can be resource-intensive and error-prone. Provide an option to extract tables from specific pages to save memory, and show a confidence score or preview of the extracted data before downloading so users can verify it.

3. **Preview Markdown/HTML Extractions**: Before forcing a download for Markdown or HTML text extractions, show a preview modal. This lets the user see the extracted text and decide if it's correct without downloading a file.

4. **Implement Robust Progress Bars for Long Operations**: For slow conversions like exporting to DOCX or True Dark, provide a granular progress bar (e.g., "Processing page 1 of 10") instead of a generic spinner. Allow users to cancel long-running tasks safely.

5. **Provide Options for Image Extraction**: Give users options for how they want to extract images, such as choosing the output format (ZIP of PNGs vs. JPEGs) or allowing them to select resolution scaling.

6. **Clarify "Sanitize" Operations**: "Sanitize" can be vague. Show a summary of exactly what will be removed before executing (e.g., "Found 3 hidden layers and Author metadata. Remove?").

7. **Offer Granular Optimization and Resize Settings**: Provide options for compression levels (Low, Medium, High) with an estimated output size. Let users choose standard document sizes (A4, Letter) dynamically when clicking "Resize".

8. **Improve Security UX (Passwords & Verifications)**: Add an eye icon to reveal the password while typing and a password strength indicator. For Signature Auditing, translate technical cryptographic output into simple terms (e.g., "Signature is Valid and matches [Name]").

9. **Enhance OCR and Read Aloud UX**: For OCR, allow users to process only the currently viewed page by default to save resources. For the Read Aloud (TTS) feature, highlight the text currently being read and provide controls to pause or skip.

10. **Declutter the Interface and Centralize Tools**: Currently, features are duplicated in a massive right-click Context Menu and nested inside accordion tags. Move primary actions (Download, Remove, Split) to the card's surface. Group the rest under a clean, single "Tools" dropdown or a dedicated modal/sidebar when a document is selected to reduce clutter.