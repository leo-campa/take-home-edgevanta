/**
 * @jest-environment node
 */
import type { NextApiRequest, NextApiResponse } from "next";

jest.mock("@/lib/agent", () => ({
  TOOLS: [],
  executeTool: jest.fn(),
}));

import { executeTool } from "@/lib/agent";
import handler from "@/pages/api/tools/invoke";

const mockExecuteTool = executeTool as jest.Mock;

function buildMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res as unknown as NextApiResponse;
}

function buildReq(body: object, method = "POST"): NextApiRequest {
  return { method, body } as unknown as NextApiRequest;
}

describe("POST /api/tools/invoke", () => {
  beforeEach(() => mockExecuteTool.mockReset());

  it("calls executeTool and returns parsed result", async () => {
    const items = [{ id: "1", description: "Concrete", total_cost: 5000 }];
    mockExecuteTool.mockResolvedValue(JSON.stringify(items));

    const res = buildMockRes();
    await handler(
      buildReq({ name: "get_top_expensive_items", input: { n: 1 } }),
      res,
    );

    expect(mockExecuteTool).toHaveBeenCalledWith("get_top_expensive_items", {
      n: 1,
    });
    expect(res.json).toHaveBeenCalledWith({ result: items });
  });

  it("defaults input to empty object when omitted", async () => {
    mockExecuteTool.mockResolvedValue(
      JSON.stringify({ average_unit_price: 42 }),
    );

    const res = buildMockRes();
    await handler(buildReq({ name: "get_average_unit_price" }), res);

    expect(mockExecuteTool).toHaveBeenCalledWith("get_average_unit_price", {});
  });

  it("returns 400 when name is missing", async () => {
    const res = buildMockRes();
    await handler(buildReq({ input: { n: 5 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it("returns 405 for GET requests", async () => {
    const res = buildMockRes();
    await handler(buildReq({}, "GET"), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it("propagates unknown tool name result from executeTool", async () => {
    const errorResult = { error: "Unknown tool: nonexistent" };
    mockExecuteTool.mockResolvedValue(JSON.stringify(errorResult));

    const res = buildMockRes();
    await handler(buildReq({ name: "nonexistent" }), res);

    expect(res.json).toHaveBeenCalledWith({ result: errorResult });
  });
});
