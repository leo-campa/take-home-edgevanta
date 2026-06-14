/**
 * @jest-environment node
 */
import type { NextApiRequest, NextApiResponse } from "next";
import handler from "./chat";

jest.mock("@/lib/agent", () => ({
  runAgent: jest.fn(),
}));

import { runAgent } from "@/lib/agent";

const mockRunAgent = runAgent as jest.Mock;

type SseEvent = { type: string; content?: string; message?: string };

function buildMockRes() {
  const written: string[] = [];
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
    write: (chunk: string) => {
      written.push(chunk);
    },
    end: jest.fn(),
    written,
  };
  return res as unknown as NextApiResponse & { written: string[] };
}

function buildReq(body: object, method = "POST"): NextApiRequest {
  return { method, body } as unknown as NextApiRequest;
}

function parseEvents(written: string[]): SseEvent[] {
  return written
    .join("")
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as SseEvent);
}

describe("POST /api/chat", () => {
  beforeEach(() => mockRunAgent.mockReset());

  it("streams token events and a done event", async () => {
    mockRunAgent.mockImplementation(
      async (_q: string, onToken: (t: string) => void) => {
        onToken("Hello ");
        onToken("world.");
      },
    );

    const res = buildMockRes();
    await handler(buildReq({ question: "test?" }), res);

    const events = parseEvents(res.written);
    expect(
      events.some((e) => e.type === "token" && e.content === "Hello "),
    ).toBe(true);
    expect(
      events.some((e) => e.type === "token" && e.content === "world."),
    ).toBe(true);
    expect(events.some((e) => e.type === "done")).toBe(true);
    expect(res.end).toHaveBeenCalled();
  });

  it("sends no_data event when store is empty (agent emits no-data message)", async () => {
    mockRunAgent.mockImplementation(
      async (_q: string, onToken: (t: string) => void) => {
        onToken("No bid data loaded. Please upload a CSV file first.");
      },
    );

    const res = buildMockRes();
    await handler(buildReq({ question: "any question?" }), res);

    const events = parseEvents(res.written);
    const tokenEvents = events.filter((e) => e.type === "token");
    expect(tokenEvents.length).toBeGreaterThan(0);
  });

  it("sends error event when agent throws", async () => {
    mockRunAgent.mockRejectedValue(new Error("model timeout"));

    const res = buildMockRes();
    await handler(buildReq({ question: "crash test" }), res);

    const events = parseEvents(res.written);
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.message).toContain("model timeout");
  });

  it("returns 400 when question is missing", async () => {
    const res = buildMockRes();
    await handler(buildReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when question is whitespace only", async () => {
    const res = buildMockRes();
    await handler(buildReq({ question: "   " }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 405 for GET requests", async () => {
    const res = buildMockRes();
    await handler(buildReq({}, "GET"), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
