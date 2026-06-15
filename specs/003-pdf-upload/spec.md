# Feature Specification: PDF Upload and Chat Integration

**Feature Branch**: `003-pdf-upload`

**Created**: 2026-06-14

**Status**: Complete

**Input**: User description: "I want to add a feature where the user can upload pdf files. The button to upload the pdf must stay right above of csv button. The pdf should follow the same flow of csv but having its own files structure but rendering the result on the chat as csv is doing"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload PDF and Trigger Ingestion (Priority: P1)

An estimator opens the chat interface, sees a PDF upload button positioned directly above the existing CSV upload button, selects a PDF file, and submits it. The system uploads the PDF to the backend, which saves it locally, extracts and normalizes the text content, generates embeddings, and stores everything in the PDF partition of the in-memory vector store. Any previously loaded CSV data is preserved. The UI shows a confirmation message in the chat when ingestion is complete.

**Why this priority**: This is the entry point for the PDF flow — without data ingested, the chat agent cannot answer questions about the PDF content. All other PDF stories depend on this working first.

**Independent Test**: Can be tested by uploading a PDF file and verifying: the file appears on the local filesystem, a success confirmation appears in the chat (including filename and chunk count), and the backend reports the number of content chunks processed.

**Acceptance Scenarios**:

1. **Given** the user has a valid PDF file, **When** they select it using the PDF upload button and submit, **Then** the file is saved on the server, the content is extracted and processed, and the chat displays a confirmation message (e.g., "Uploaded 'estimate.pdf' — 48 content chunks ingested").
2. **Given** PDF ingestion is in progress, **When** the file is being processed, **Then** the UI shows a loading/progress indicator and disables the PDF upload button until processing is complete.
3. **Given** the user selects a non-PDF file via the PDF upload control, **When** the upload is attempted, **Then** the UI rejects the file before submission and displays a clear inline error (e.g., "Only PDF files are accepted").
4. **Given** a PDF is uploaded when a CSV is already loaded, **When** the PDF is submitted, **Then** only the PDF partition of the store is updated; the CSV data remains available; existing chat history is preserved; and a system message is inserted: "Uploaded 'filename.pdf' — {N} chunks ingested." (not "replaced", since CSV data is not affected).
5. **Given** a second PDF is uploaded when a first PDF is already loaded, **When** the new PDF is submitted, **Then** the PDF partition is replaced with the new content and a system message is inserted: "PDF dataset replaced: '{filename}' — {N} chunks ingested."
6. **Given** a PDF file exceeds the size limit, **When** the user attempts to select it, **Then** the file is rejected client-side before any upload is attempted, with a clear error message.

---

### User Story 2 - Ask Questions About PDF Content and Combined Sources (Priority: P1)

After a PDF is ingested, the estimator types a natural language question into the text input and submits it. The agent searches the PDF content and, when CSV bid data is also loaded, combines results from both sources to answer the question. The response streams into the conversation area in the same format as CSV-sourced answers.

**Why this priority**: This is the primary interaction loop — the agent's ability to draw on both plan documents and bid data simultaneously is the core differentiator of this feature.

**Independent Test**: Can be tested by ingesting both a PDF and a CSV, then submitting questions that span both sources, verifying the response streams and references content from both.

**Acceptance Scenarios**:

1. **Given** a PDF is ingested and the user types a question and presses Enter or clicks Send, **Then** the question appears as a user message and the agent's streamed response appears as a new message in the conversation area.
2. **Given** both CSV and PDF are loaded and the user asks a question that spans both (e.g., "Are the drainage quantities in the bid consistent with the plan notes?"), **Then** the agent uses both sources and references each in the response.
3. **Given** the agent is generating a response, **When** the request is in-flight, **Then** the UI shows a streaming/loading indicator and disables the send button until the response completes.
4. **Given** a question is asked before any data is uploaded (neither CSV nor PDF), **When** the user submits, **Then** the agent responds with a clear message indicating no data has been loaded yet.
5. **Given** only PDF is loaded (no CSV), **When** the user asks a question requiring bid analytics (e.g., "What are the top expensive items?"), **Then** the agent explains that no CSV bid data is available and answers only from the plan documents if relevant.

---

### User Story 3 - UI Layout: PDF Button Above CSV Button (Priority: P1)

When a user visits the chat interface, they see two distinct upload controls in the same panel: a PDF upload button positioned directly above the CSV upload button. The buttons are visually distinct (labeled clearly) so there is no ambiguity about which format each accepts.

**Why this priority**: Explicit in the feature request — the positional relationship between the two buttons is a required UX constraint, not a preference.

**Independent Test**: Can be tested by inspecting the rendered chat interface and verifying the PDF button appears immediately above the CSV button in DOM order and visual rendering, with no other elements between them.

**Acceptance Scenarios**:

1. **Given** the chat interface is loaded, **When** the user views the upload area, **Then** they see a PDF upload button immediately above the CSV upload button, with both labeled clearly (e.g., "Upload PDF" and "Upload CSV").
2. **Given** both upload buttons are visible, **When** neither upload is in progress, **Then** both buttons are independently enabled and clickable.
3. **Given** a PDF upload is in progress, **When** the PDF ingestion is running, **Then** only the PDF upload button is disabled; the CSV upload button remains enabled (and vice versa).

---

### Edge Cases

- Empty PDF (zero pages or no extractable text after attempting both extraction methods on all pages): rejected at the backend; the UI displays an error in the chat ("No text content could be extracted from the PDF — please try a different file"). CSV data (if loaded) is unaffected.
- Individual page extraction failure (blank page, unreadable scan, transient vision API error): the page is skipped and counted in `skipped_pages`; a per-page warning is recorded; ingestion continues with all remaining pages. The confirmation message includes the skip count (e.g., "Uploaded 'plan.pdf' — 87 chunks ingested, 2 pages skipped"). Only when all pages are skipped does the ingestion fail entirely.
- Whole-file extraction failure (corrupted file, encrypted/password-protected PDF that cannot be opened at all): the backend returns an error; the UI displays the failure reason in the chat and re-enables the PDF upload button for retry. CSV data (if loaded) is unaffected.
- Embedding generation fails partway through PDF ingestion: the system rolls back the PDF partition entirely — clears any partially stored PDF data — and returns an error. The UI displays the failure reason and re-enables the PDF upload button. CSV data is unaffected.
- Simultaneous upload attempt: each upload button controls its own partition independently; one upload completing or failing does not affect the other.
- Large fully-scanned PDF exceeding `MAX_VISION_PAGES` (default: 50): pages within the cap are processed normally via vision fallback; pages beyond the cap are skipped and counted in `skipped_pages`. A warning is included in the API response (e.g., "Vision cap of 50 reached — 30 pages not attempted"). The ingestion succeeds with the content extracted from pages within the cap. The UI shows the confirmation message with the skip count.
- Non-PDF file selected via PDF control: rejected client-side.
- Server restart: all in-memory data (both CSV and PDF partitions) is lost; the next chat request returns a no-data response; the UI shows a system message prompting re-upload.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The UI MUST provide a PDF upload control positioned immediately above the CSV upload control in the same upload panel; the PDF control MUST accept only PDF files.
- **FR-002**: The PDF upload control MUST reject non-PDF files client-side before submission, displaying a clear inline error message.
- **FR-003**: PDF files exceeding the upload size limit MUST be rejected client-side before any network request is sent, with a clear error message displayed to the user.
- **FR-004**: The UI MUST disable the PDF upload control while a PDF ingestion is in progress, and re-enable it when ingestion completes or fails; the CSV upload control MUST remain independently controllable.
- **FR-005**: The backend MUST save the uploaded PDF file to the local filesystem before processing it (in its own upload directory, separate from CSV uploads).
- **FR-006**: The backend MUST extract text content from the uploaded PDF, split it into content chunks suitable for embedding, and report the number of chunks processed.
- **FR-007**: The backend MUST generate embeddings for the extracted PDF content chunks and store them in the PDF partition of the in-memory vector store; the CSV partition MUST NOT be modified.
- **FR-008**: When a second PDF is uploaded while a first PDF is already loaded, the PDF partition MUST be replaced with the new data; a system message MUST be inserted: "PDF dataset replaced: '{filename}' — {N} chunks ingested." When a PDF is uploaded while CSV data is already loaded, the CSV partition MUST remain untouched.
- **FR-009**: The UI MUST display a confirmation message in the chat after successful PDF ingestion, including the filename and the number of content chunks processed.
- **FR-010**: The UI MUST display a clear error message in the chat (or inline on the button) when a PDF upload or ingestion fails, including the failure reason.
- **FR-011**: If a single PDF page yields no content after both extraction methods, that page MUST be skipped and counted in `skipped_pages`; ingestion MUST continue with the remaining pages. If ALL pages are skipped, the backend MUST return an error and the UI MUST display a clear explanation rather than silently ingesting an empty dataset. The confirmation message MUST include a unified skip count when `skipped_pages > 0` (e.g., "87 chunks ingested, 2 pages skipped") — the reason for each skipped page (extraction failure vs. vision cap reached) is recorded in the `warnings` array only and is NOT surfaced separately in the chat confirmation message.
- **FR-012**: If embedding generation fails at any point during PDF ingestion, the system MUST roll back the PDF partition entirely — clearing any partially stored PDF data — and return an error. The UI MUST display the failure reason and re-enable the PDF upload control for retry.
- **FR-013**: The PDF ingestion pipeline MUST have its own dedicated file and module structure, separate from the CSV pipeline, while sharing the same vector store and agent/chat infrastructure.
- **FR-018**: The vision fallback path MUST be capped at a configurable maximum number of pages per ingestion session (`MAX_VISION_PAGES`, default: 50). Pages beyond this cap MUST be treated as skipped (same skip-and-continue rules as FR-011), counted in `skipped_pages`, and recorded in the `warnings` array with a reason indicating the cap was reached. If the cap is hit, the API response MUST include a warning noting how many pages were not attempted.
- **FR-014**: Agent responses to questions asked after PDF ingestion MUST stream token-by-token to the browser and render in the conversation area in the same format as CSV-sourced answers.
- **FR-015**: If no data has been ingested (neither CSV nor PDF), the agent MUST respond to queries with a message indicating that no data is available.
- **FR-016**: The agent MUST search both the CSV partition and the PDF partition when both are loaded, combining results from both sources to answer the user's question.
- **FR-017**: When only PDF is loaded (no CSV), the agent MUST answer from the PDF content and explicitly state that no CSV bid data is available when the question requires analytical bid tools.

### Key Entities

- **PdfUploadedFile**: A PDF saved on the local filesystem. Tracks the original filename, save path, upload timestamp, and ingestion status. Stored separately from CSV uploaded files.
- **PdfExtractionResult**: The output of a PDF text extraction run. Includes total pages processed, number of content chunks extracted, sheet identifiers found, and any per-page warnings (e.g., pages with no extractable text).
- **ContentChunk**: A unit of text extracted from the PDF, ready for embedding. Tracks source page number, sheet identifier (e.g., "D-101"), section title (e.g., "Drainage Notes"), and text content.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001a**: A user can upload a 10-page digitally-generated PDF (text layer present), see a confirmation in the chat, and ask their first question within 30 seconds on standard hardware (native extraction path; no AI vision calls required).
- **SC-001b**: A user can upload a 10-page fully-scanned PDF (no text layer), see a confirmation in the chat, and ask their first question within 120 seconds on standard hardware (all pages go through vision fallback; ~10 GPT-4.1 API calls).
- **SC-002a**: After submitting a question about PDF content, the first streaming token appears in the conversation within 2 seconds.
- **SC-002b**: The full agent response is complete within 15 seconds of submission for questions that do not require large-scale retrieval.
- **SC-003**: 100% of non-PDF file upload attempts via the PDF control are rejected client-side before reaching the backend.
- **SC-004**: After a successful PDF ingestion, the confirmation message accurately reflects the number of content chunks and the filename — verifiable against the uploaded file.
- **SC-005**: The PDF upload button is visually positioned directly above the CSV upload button with no intervening elements — verifiable by inspection of the rendered UI.
- **SC-006**: The uploaded PDF file is present on the server's local filesystem immediately after a successful ingestion.
- **SC-007**: When both CSV and PDF are loaded, the agent's response to a combined question references content from both sources — verifiable by asking a question that spans both datasets.

## Clarifications

### Session 2026-06-14

- Q: Should CSV and PDF data coexist in the vector store (agent searches both), or should uploading one replace the other? → A: Coexist — CSV and PDF occupy separate partitions; uploading one does not clear the other; the agent searches both and combines results.
- Q: When an individual PDF page fails both native and vision extraction, should the ingestion skip that page and continue, or abort and roll back? → A: Skip and continue — failed pages are counted in `skipped_pages` with a warning; ingestion only fails entirely when all pages are skipped.
- Q: SC-001 targets 10-page PDF in 120s, but hybrid extraction means native PDFs complete in seconds while scanned PDFs take much longer — should the success criterion split by PDF type? → A: Yes — two targets: SC-001a (10-page digitally-generated PDF ≤ 30s, native path) and SC-001b (10-page scanned PDF ≤ 120s, all-vision path).

### Session 2026-06-14 (continued)

- Q: For large scanned PDFs where vision fallback is needed for many pages, what should happen when processing would take very long or exceed the server timeout? → A: B — cap the number of pages that may use vision fallback per ingestion session (MAX_VISION_PAGES = 50 default); pages beyond the cap are treated as skipped with a warning in the response.
- Q: Should the chat confirmation message distinguish between pages skipped due to extraction failure vs. pages not attempted due to the vision cap? → A: C — single unified `skipped_pages` count in the chat confirmation message; per-page reason breakdown (failure vs. cap) available only in the `warnings` array of the API response.

## Assumptions

- PDF content is treated as unstructured text for embedding purposes; tables and structured data within the PDF are captured as text but not parsed into structured fields (unlike CSV column normalization).
- The PDF upload size limit matches the CSV limit (500 MB). Ingestion performance differs substantially by PDF type: digitally-generated PDFs (with embedded text layers) process via native extraction and complete in seconds; scanned PDFs require vision fallback for each image-only page and take proportionally longer. SC-001a and SC-001b reflect these two reference cases.
- The vision fallback is capped at `MAX_VISION_PAGES = 50` pages per ingestion session by default. This prevents server timeout (10-minute API ceiling) for large fully-scanned plan sets: 50 pages × ~10 s per call ≈ 500 s, within the 600 s endpoint limit. Pages beyond the cap are skipped with a warning; the cap constant can be raised without code changes elsewhere.
- The in-memory vector store holds two independent partitions — one for CSV bid data and one for PDF plan content. Each partition is replaced only when a new file of the same type is uploaded.
- The agent has distinct tools for each partition: structured analytics tools and `query_bid_data` for CSV; `search_plan_documents` for PDF. It may call tools from both partitions in a single response turn.
- Password-protected or encrypted PDFs are treated as extraction failures and rejected with a clear error message.
- The application remains single-user and local-only; no authentication or multi-session handling is added.
- Conversation history is in-memory for the browser session only — a page refresh clears the chat.
- Markdown formatting in agent responses is rendered (not displayed as raw text), consistent with the existing CSV flow.
