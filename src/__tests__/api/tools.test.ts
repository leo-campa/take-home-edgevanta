/**
 * @jest-environment node
 */

import type { Tool } from "@anthropic-ai/sdk/resources";
import type { NextApiRequest, NextApiResponse } from "next";

const MOCK_TOOLS: Tool[] = [
  {
    name: "get_top_expensive_items",
    description: "Returns the top N most expensive bid items by total cost.",
    input_schema: {
      type: "object",
      properties: { n: { type: "number" } },
      required: ["n"],
    },
  },
];

jest.mock("@/lib/agent", () => ({
  TOOLS: MOCK_TOOLS,
  executeTool: jest.fn(),
}));

import handler from "@/pages/api/tools/index";

function buildMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res as unknown as NextApiResponse;
}

function buildReq(method = "GET"): NextApiRequest {
  return { method } as unknown as NextApiRequest;
}

describe("GET /api/tools", () => {
  it("returns the tool catalog", async () => {
    const res = buildMockRes();
    handler(buildReq("GET"), res);
    expect(res.json).toHaveBeenCalledWith({ tools: MOCK_TOOLS });
  });

  it("returns 405 for POST requests", async () => {
    const res = buildMockRes();
    handler(buildReq("POST"), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
