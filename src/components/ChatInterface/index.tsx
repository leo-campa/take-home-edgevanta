import { useState } from "react";
import ChatInput from "@/components/ChatInput";
import FileUpload from "@/components/FileUpload";
import type { IngestionResult } from "@/components/FileUpload/model";
import MessageList from "@/components/MessageList";
import PdfUpload from "@/components/PdfUpload";
import type { PdfIngestionResult } from "@/components/PdfUpload/model";
import { useChat } from "@/hooks/useChat";

export default function ChatInterface() {
  const { messages, isStreaming, retryLast, sendQuestion, addMessage } =
    useChat();
  const [dataLoaded, setDataLoaded] = useState(false);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [isPdfUploading, setIsPdfUploading] = useState(false);
  const [isCsvUploading, setIsCsvUploading] = useState(false);

  function handleUpload(result: IngestionResult) {
    const text = dataLoaded
      ? `Dataset replaced: '${result.filename}' — ${result.record_count} items ingested.`
      : `Uploaded '${result.filename}' — ${result.record_count} items ingested.`;

    addMessage({
      id: crypto.randomUUID(),
      role: "system",
      type: "message",
      content: text,
      timestamp: Date.now(),
    });

    setDataLoaded(true);
  }

  function handleUploadError(message: string) {
    addMessage({
      id: crypto.randomUUID(),
      role: "system",
      type: "message",
      content: `Upload error: ${message}`,
      timestamp: Date.now(),
    });
  }

  function handlePdfUpload(result: PdfIngestionResult) {
    const text = pdfLoaded
      ? `PDF dataset replaced: '${result.filename}' — ${result.chunk_count} chunks ingested.`
      : `Uploaded '${result.filename}' — ${result.chunk_count} chunks ingested.`;

    addMessage({
      id: crypto.randomUUID(),
      role: "system",
      type: "message",
      content: text,
      timestamp: Date.now(),
    });

    setPdfLoaded(true);
  }

  function handlePdfUploadError(message: string) {
    addMessage({
      id: crypto.randomUUID(),
      role: "system",
      type: "message",
      content: `Upload error: ${message}`,
      timestamp: Date.now(),
    });
  }

  return (
    <div className="chat-interface-component">
      <header className="chat-interface-component__topbar">
        <span className="chat-interface-component__topbar-title">
          Agent Edgevanta
        </span>
      </header>
      <div className="chat-interface-component__message-area">
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          onRetry={retryLast ?? undefined}
        />
      </div>
      <div className="chat-interface-component__input-row">
        <div className="chat-interface-component__upload-section">
          <PdfUpload
            onUpload={handlePdfUpload}
            onError={handlePdfUploadError}
            onLoadingChange={setIsPdfUploading}
            disabled={isStreaming || isCsvUploading}
          />
          <FileUpload
            onUpload={handleUpload}
            onError={handleUploadError}
            onLoadingChange={setIsCsvUploading}
            disabled={isStreaming || isPdfUploading}
          />
        </div>
        <ChatInput onSend={sendQuestion} isStreaming={isStreaming} />
      </div>
    </div>
  );
}
