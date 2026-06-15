import type { NextApiRequest, NextApiResponse } from "next";
import { executeTool } from "@/lib/agent";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as { name?: string; input?: Record<string, unknown> };
  const { name, input } = body;

  if (!name) {
    return res.status(400).json({ error: "Missing 'name'" });
  }

  const raw = await executeTool(name, input ?? {});
  res.json({ result: JSON.parse(raw) });
}
