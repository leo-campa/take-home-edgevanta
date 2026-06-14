import { useState } from "react";
import ChatInput from "@/components/ChatInput";
import FileUpload from "@/components/FileUpload";
import type { IngestionResult } from "@/components/FileUpload/model";
import MessageList from "@/components/MessageList";
import PdfUpload from "@/components/PdfUpload";
import type { PdfIngestionResult } from "@/components/PdfUpload/model";
import { useChat } from "@/hooks/useChat";
import styles from "./chat-interface.component.module.scss";

export default function ChatInterface() {
  const { messages, isStreaming, sendQuestion, addMessage } = useChat();
  const [dataLoaded, setDataLoaded] = useState(false);
  const [pdfLoaded, setPdfLoaded] = useState(false);

  function handleUpload(result: IngestionResult) {
    const text = dataLoaded
      ? `Dataset replaced: '${result.filename}' — ${result.record_count} items ingested.`
      : `Uploaded '${result.filename}' — ${result.record_count} items ingested.`;

    addMessage({
      id: crypto.randomUUID(),
      role: "system",
      content: text,
      timestamp: Date.now(),
    });

    setDataLoaded(true);
  }

  function handleUploadError(message: string) {
    addMessage({
      id: crypto.randomUUID(),
      role: "system",
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
      content: text,
      timestamp: Date.now(),
    });

    setPdfLoaded(true);
  }

  function handlePdfUploadError(message: string) {
    addMessage({
      id: crypto.randomUUID(),
      role: "system",
      content: `Upload error: ${message}`,
      timestamp: Date.now(),
    });
  }

  return (
    <div className={styles["chat-interface-component"]}>
      <div className={styles["chat-interface-component__message-area"]}>
        <MessageList messages={messages} isStreaming={isStreaming} />
      </div>
      <div className={styles["chat-interface-component__input-row"]}>
        <div className={styles["chat-interface-component__upload-section"]}>
          <PdfUpload
            onUpload={handlePdfUpload}
            onError={handlePdfUploadError}
            disabled={isStreaming}
          />
          <FileUpload
            onUpload={handleUpload}
            onError={handleUploadError}
            disabled={isStreaming}
          />
        </div>
        <ChatInput onSend={sendQuestion} isStreaming={isStreaming} />
      </div>
    </div>
  );
}
