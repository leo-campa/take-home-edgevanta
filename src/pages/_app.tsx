// import "@/styles/globals.scss";
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
