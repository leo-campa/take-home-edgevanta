# Feature Specification: Chat UI with CSV Upload

**Feature Branch**: `002-chat-ui-csv-upload`

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Create a chat UI to communicate with the agent. The chat has a text input for questions and a separate input to upload a CSV file. Agent results are displayed above the text input. The backend parses the CSV, normalizes columns, generates embeddings, stores data in an in-memory vector store, and saves the uploaded file locally."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload CSV and Trigger Ingestion (Priority: P1)

An estimator opens the chat interface, selects a CSV file using the file upload control, and submits it. The system uploads the file to the backend, which saves it locally, parses and normalizes the bid data, generates embeddings, and stores everything in the in-memory vector store. The UI shows a confirmation when ingestion is complete.

**Why this priority**: This is the entry point — without data ingested, the chat agent cannot answer questions. All other stories depend on this working first.

**Independent Test**: Can be tested by uploading a CSV file and verifying: the file appears on the local filesystem, a success confirmation is shown in the UI, and the backend reports the number of records processed.

**Acceptance Scenarios**:

1. **Given** the user has a valid DOT bid CSV file, **When** they select it with the file upload control and submit, **Then** the file is saved on the server, the data is processed, and the chat displays a confirmation message (e.g., "Uploaded 'bid_data.csv' — 312 items ingested").
2. **Given** ingestion is in progress, **When** the file is being processed, **Then** the UI shows a loading/progress indicator and disables the upload control until processing is complete.
3. **Given** the user uploads an invalid or non-CSV file, **When** the upload is attempted, **Then** the UI rejects the file before submission and displays a clear error (e.g., "Only CSV files are accepted").
4. **Given** the CSV has messy or abbreviated column names, **When** ingested, **Then** the backend normalizes them and the confirmation message reflects the columns successfully mapped.
5. **Given** the user uploads a second CSV after a first was already ingested, **When** the new file is submitted, **Then** the in-memory store is replaced with the new dataset (not merged), the existing chat history is preserved, and a system message is inserted: "Dataset replaced: '{filename}' — {N} items ingested."

---

### User Story 2 - Ask Questions and See Agent Responses (Priority: P1)

After data is ingested, the estimator types a natural language question into the text input and submits it. The agent processes the question against the stored bid data and returns a response, which appears in the conversation area above the input — in a readable chat-style layout, newest messages visible without excessive scrolling.

**Why this priority**: This is the primary interaction loop — file upload enables it, but the conversational Q&A is the core user value.

**Independent Test**: Can be tested by ingesting a sample CSV and submitting known-answer questions, verifying the response appears in the conversation area and is accurate.

**Acceptance Scenarios**:

1. **Given** data is ingested and the user types a question and presses Enter or clicks Send, **Then** the question appears in the conversation as a user message and the agent's response appears directly above the input area as a new message.
2. **Given** the agent is generating a response, **When** the request is in-flight, **Then** the UI shows a loading indicator in the conversation area and disables the send button.
3. **Given** a question is asked before any CSV is uploaded, **When** the user submits, **Then** the agent responds with a clear message indicating no data has been loaded yet.
4. **Given** multiple questions are asked sequentially, **When** each response arrives, **Then** the conversation area shows the full history in chronological order (oldest at top, newest just above the input).

---

### User Story 3 - Conversation History Remains Visible (Priority: P2)

As the conversation grows, earlier messages remain accessible by scrolling up. The input area stays pinned at the bottom, and the most recent exchange is always visible without manual scrolling.

**Why this priority**: Conversations often build on prior answers; losing message history would force users to re-ask questions, degrading the experience.

**Independent Test**: Can be tested by submitting 10+ messages and verifying all are visible via scroll, with the latest message auto-scrolled into view and the input pinned.

**Acceptance Scenarios**:

1. **Given** a long conversation, **When** a new message or streamed token is added, **Then** the view auto-scrolls to the bottom, regardless of the user's current scroll position.
2. **Given** a long conversation, **When** the user scrolls up between messages, **Then** earlier messages are accessible and the layout does not truncate or hide them.

---

### Edge Cases

- Empty message submission: the send button is disabled and the Enter key is blocked when the text input is empty or contains only whitespace. No submission occurs.
- File exceeds 100 MB: rejected client-side before any upload attempt; a clear error message is displayed inline (e.g., "File exceeds the 100 MB limit"). No network request is sent. Covered by FR-001.
- Streaming connection loss mid-response: an error message is appended to the conversation ("Connection lost — please try again") and the input is re-enabled so the user can retry their question.
- Server restart / data loss: if the server restarts and the in-memory store is cleared, the next chat request returns a no-data response. The UI displays a system message: "Server restarted — bid data was cleared. Please re-upload your CSV." The user is not left to discover the loss through a confusing answer.
- Navigation away and return: conversation history is not persisted — navigating away from `/chat` or refreshing clears the chat. The server-side data (vector store) remains in memory until the server restarts. On return, the user starts a fresh conversation but may ask questions immediately if the server still holds data.
- Partial embedding failure: if embedding generation fails at any point during ingestion, the entire operation is rolled back — the in-memory store is cleared and no partial data is retained. The UI displays a clear error message with the failure reason and the upload control is re-enabled for retry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The UI MUST provide a file upload control that accepts only CSV files up to 100 MB and triggers backend ingestion on submission; files exceeding 100 MB MUST be rejected client-side with a clear error message.
- **FR-002**: The UI MUST provide a text input field for typing natural language questions, with a send mechanism (button or Enter key). The send button MUST be disabled and the Enter key MUST be blocked when the input is empty or contains only whitespace.
- **FR-003**: The UI MUST display agent responses in a conversation area positioned between the top of the page and the text input, with the input pinned to the bottom.
- **FR-004**: The conversation area MUST show the full message history in chronological order (oldest at top, newest just above the input).
- **FR-005**: The UI MUST auto-scroll to the bottom of the conversation on every new message and on every streamed token, regardless of the user's current scroll position.
- **FR-006**: The UI MUST show a loading/in-progress indicator while a file upload is processing or while the agent is generating a response.
- **FR-007**: The UI MUST disable the text input and send button while the agent is generating a response; it MUST disable the file upload control while ingestion is in progress.
- **FR-008**: The UI MUST display a clear confirmation message in the conversation after a file is successfully ingested, including the filename and the number of records processed.
- **FR-009**: The UI MUST display a clear error message in the conversation (or inline) when an upload fails or a question cannot be answered.
- **FR-010**: The backend MUST save the uploaded CSV file to the local filesystem before processing it.
- **FR-011**: The backend MUST parse the CSV, normalize column names (mapping abbreviated/inconsistent headers to canonical field names), and report the mapping results.
- **FR-012**: The backend MUST generate embeddings for the ingested bid items and store them in an in-memory vector store.
- **FR-013**: The backend MUST replace the in-memory dataset when a new CSV is uploaded (no merging of datasets across uploads within the same session). The existing chat history MUST be preserved; a system message MUST be inserted into the conversation: "Dataset replaced: '{filename}' — {N} items ingested."
- **FR-014**: The UI MUST reject non-CSV files at the client side before the upload is attempted, with a user-facing error message.
- **FR-015**: If no data has been ingested, the agent MUST respond to queries with a message indicating that no data is available, rather than returning an empty or confusing result.
- **FR-016**: If the streaming connection is interrupted during a response, the UI MUST append an error message in the conversation ("Connection lost — please try again") and re-enable the input so the user can retry.
- **FR-017**: If embedding generation fails at any point during CSV ingestion, the system MUST roll back entirely — clearing any partially stored data — and return an error response. The UI MUST display the failure reason and re-enable the upload control for retry.
- **FR-018**: If the server restarts and the in-memory store is cleared, any subsequent chat request MUST return a `no_data` response, and the UI MUST display a system message in the conversation prompting the user to re-upload their CSV.

### Key Entities

- **Message**: A single entry in the conversation. Has a role (user or agent), content (text), and a timestamp. May carry metadata such as "system" type for ingestion confirmations.
- **UploadedFile**: The CSV file saved on the local filesystem. Tracks the original filename, save path, upload timestamp, and ingestion status.
- **IngestionResult**: The output of a CSV processing run. Includes records ingested count, records skipped count, column mapping applied, and any warnings.
- **ConversationSession**: The in-memory sequence of Messages for the current browser session. Not persisted across page refreshes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can upload a CSV file, see a confirmation in the chat, and ask their first question within 90 seconds of opening the application (assuming a 500-row CSV and standard hardware).
- **SC-002a**: After submitting a question, the first streaming token appears in the conversation within 2 seconds.
- **SC-002b**: The full agent response is complete within 15 seconds of submission for questions that do not require large-scale retrieval.
- **SC-003**: The conversation area correctly renders all messages when 20 or more exchanges have occurred, with the newest message auto-scrolled into view.
- **SC-004**: 100% of non-CSV file upload attempts are rejected at the client side before reaching the backend.
- **SC-005**: After a successful ingestion, the confirmation message accurately reflects the number of records and the filename — verifiable against the uploaded file.
- **SC-006**: The uploaded CSV file is present on the server's local filesystem immediately after a successful ingestion.

## Clarifications

### Session 2026-06-13

- Q: Maximum CSV file upload size → A: 100 MB (client-side rejection for files exceeding this limit)
- Q: What happens when the user submits an empty message? → A: Disable send button and block Enter key when input is empty or whitespace-only (no submission occurs)
- Q: What should happen if the streaming connection drops mid-response? → A: Append error in conversation ("Connection lost — please try again") and re-enable input so user can retry
- Q: What should happen if embedding generation fails partway through a CSV? → A: Roll back entirely — clear the store, show error with reason, re-enable upload for retry; no partial data retained
- Q: How should streaming response latency be measured in SC-002? → A: Split into two metrics: first token ≤ 2 s (SC-002a) and full response ≤ 15 s (SC-002b)
- Q: What happens when the server restarts and in-memory data is lost? → A: Next chat request returns no_data response; UI shows system message prompting re-upload
- Q: When a second CSV is uploaded mid-conversation, what happens to existing chat messages? → A: Keep history, insert system message "Dataset replaced: '{filename}' — {N} items ingested"
- Q: After a page refresh (server still running, data in memory), should the UI proactively check data status on mount? → A: No — the natural no_data response on first question is sufficient feedback
- Q: Should auto-scroll pause when the user has manually scrolled up? → A: No — always scroll to bottom on every token and message, regardless of scroll position

## Assumptions

- The UI is a web-based interface (browser); a CLI is not sufficient for this feature since file upload and chat rendering are visual interactions.
- The application is single-user and local-only; no authentication or session management beyond the browser tab is required.
- Conversation history is in-memory for the browser session only — a page refresh clears the chat. Persistence across sessions is out of scope.
- The in-memory vector store is cleared and replaced on each new CSV upload; there is no support for querying across multiple datasets simultaneously.
- There is no data-status endpoint or on-mount polling. After a page refresh, the UI starts with an empty conversation; if the server still holds data, the user will discover it naturally on their first question. If no data is loaded, the no_data response prompts re-upload.
- The server saves uploaded CSV files to a configurable local directory (e.g., `./uploads/`). File management (deletion, listing prior uploads) is out of scope.
- The file size limit for uploads is 100 MB; the system must handle large DOT bid tabulation files without timing out on a standard developer machine.
- Markdown formatting in agent responses is rendered (not displayed as raw text) for readability.
- The project already has a Next.js frontend scaffolded; this feature adds UI components and API routes to the existing project. The chat interface is served at `/chat`; the root `/` redirects there via `getServerSideProps`.
