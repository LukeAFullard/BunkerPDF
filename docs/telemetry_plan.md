# Product Telemetry Plan

## Philosophy

BunkerPDF's core value proposition is absolute user privacy and zero-trust data handling. Our telemetry strategy must reflect this. We adhere to a strict **"Privacy First, Data Second"** principle.

## Telemetry Principles
1.  **Strictly Opt-In:** Telemetry is disabled by default. Users are presented with a clear, jargon-free choice during onboarding to opt-in to anonymous usage data collection.
2.  **Absolute Anonymity:** We collect absolutely no Personally Identifiable Information (PII) or document data. No filenames, no document content, no user IDs, no IP addresses.
3.  **Transparency:** Users can view the exact data payload being collected at any time within the application settings.
4.  **Local-First Aggregation:** To minimize network requests and respect offline workflows, telemetry events are logged locally and batched.

## Data Collection Mechanisms

### What We Collect (The "Signal")
We focus exclusively on product usage and performance metrics to guide development:
*   **Tool Usage Frequencies:** Which tools are most popular? (e.g., `event: "tool_used", name: "merge_pdfs"`)
*   **Engine Performance:** How long do operations take? (e.g., `event: "engine_timing", engine: "pdf-lib", operation: "split", duration_ms: 1250`)
*   **Error Rates & Exceptions:** Are users encountering failures? (e.g., `event: "error", type: "oom_exception", context: "pyodide_load"`)
*   **Environment Data:** Browser type, WASM support level, and available memory (if accessible) to optimize performance.

### What We DO NOT Collect
*   Document contents, text, or structure.
*   Filenames or file paths.
*   IP addresses or location data.
*   User email addresses or identifying metadata.

## Implementation Architecture

### 1. Local Logging (IndexedDB)
When an opted-in user triggers a logged event, it is appended to a dedicated IndexedDB store (`bunkerpdf_telemetry`). This ensures events are captured even when the application is entirely offline.

### 2. Batching & Transmission
When the application detects an active online connection, it periodically (e.g., every 5 minutes or on application close) reads the batched events from IndexedDB and dispatches them to a serverless endpoint.
*   **Payload Structure:** The batched payload is a simple JSON array of events.
*   **Endpoint:** A lightweight serverless function (e.g., AWS Lambda, Cloudflare Worker) that ingests the JSON and stores it in an analytics database.
*   **Clear After Send:** Upon successful transmission (HTTP 200), the sent events are purged from the local IndexedDB.

### 3. User Controls
*   **Opt-In/Out Toggle:** Accessible prominently in the settings menu.
*   **View Local Log:** Users can view the raw contents of their `bunkerpdf_telemetry` IndexedDB store before it is sent.
*   **Clear Local Data:** Users can manually purge unsent telemetry data at any time.

## Structured Feedback Collection
In addition to automated telemetry, we will strategically implement structured, contextual feedback mechanisms:
*   **Post-Action Quality Prompts:** After critical actions like table extraction or formatting conversion, prompt the user: "Did the output look right? 👍/👎".
*   **Dismissible Feedback Panels:** Allow users to provide short, qualitative feedback on specific features.