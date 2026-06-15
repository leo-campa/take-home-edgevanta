import "@/components/ChatInterface/chat-interface.component.scss";
import "@/components/ChatInput/chat-input.component.scss";
import "@/components/FileUpload/file-upload.component.scss";
import "@/components/MessageBubble/message-bubble.component.scss";
import "@/components/MessageList/message-list.component.scss";
import "@/components/PdfUpload/pdf-upload.component.scss";
import { CssBaseline, createTheme, ThemeProvider } from "@mui/material";
import type { AppProps } from "next/app";

const theme = createTheme();

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Component {...pageProps} />
    </ThemeProvider>
  );
}
