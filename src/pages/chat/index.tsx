import Head from "next/head";
import ChatInterface from "@/components/ChatInterface";

export default function ChatPage() {
  return (
    <>
      <Head>
        <title>Construction Bid Estimating Agent</title>
        <meta
          name="description"
          content="Chat with your construction bid data"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main
        style={{ height: "100vh", display: "flex", flexDirection: "column" }}
      >
        <ChatInterface />
      </main>
    </>
  );
}
