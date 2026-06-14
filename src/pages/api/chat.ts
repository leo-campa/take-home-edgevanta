import type { NextApiRequest, NextApiResponse } from "next";
import { runAgent } from "@/lib/agent";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as { question?: string };
  const question = body?.question?.trim();

  if (!question) {
    return res.status(400).json({ error: "Missing or empty question field" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  function writeEvent(data: object) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  try {
    await runAgent(question, (token) => {
      writeEvent({ type: "token", content: token });
    });

    writeEvent({ type: "done" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    writeEvent({ type: "error", message: `Agent failed: ${message}` });
  } finally {
    res.end();
  }
}
