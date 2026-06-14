import { act, renderHook } from "@testing-library/react";
import { useChat } from "./index";

function encodeEvent(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function makeStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
}

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("useChat", () => {
  beforeEach(() => mockFetch.mockReset());

  it("starts with empty messages and not streaming", () => {
    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
  });

  it("appends user message and agent message on sendQuestion", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeStream([
        encodeEvent({ type: "token", content: "Hello" }),
        encodeEvent({ type: "done" }),
      ]),
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendQuestion("What items?");
    });

    const messages = result.current.messages;
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("What items?");
    expect(messages[1].role).toBe("agent");
    expect(messages[1].content).toBe("Hello");
  });

  it("accumulates tokens into a single agent message", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeStream([
        encodeEvent({ type: "token", content: "Hello " }),
        encodeEvent({ type: "token", content: "world." }),
        encodeEvent({ type: "done" }),
      ]),
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendQuestion("test");
    });

    expect(result.current.messages[1].content).toBe("Hello world.");
  });

  it("sets isStreaming to false on done event", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeStream([
        encodeEvent({ type: "token", content: "data" }),
        encodeEvent({ type: "done" }),
      ]),
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendQuestion("q");
    });

    expect(result.current.isStreaming).toBe(false);
  });

  it("appends error message on error event", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeStream([
        encodeEvent({ type: "error", message: "Agent failed" }),
      ]),
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendQuestion("q");
    });

    const agent = result.current.messages[1];
    expect(agent.content).toContain("Agent failed");
    expect(result.current.isStreaming).toBe(false);
  });

  it("appends system message on no_data event", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeStream([
        encodeEvent({ type: "no_data", message: "No data loaded" }),
      ]),
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendQuestion("q");
    });

    const agent = result.current.messages[1];
    expect(agent.role).toBe("system");
    expect(agent.content).toContain("No data loaded");
  });

  it("does not allow concurrent sendQuestion calls while streaming", async () => {
    let releaseStream!: () => void;
    const pendingStream = new Promise<void>((res) => {
      releaseStream = res;
    });

    mockFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        async start(controller) {
          await pendingStream;
          controller.enqueue(encodeEvent({ type: "done" }));
          controller.close();
        },
      }),
    });

    const { result } = renderHook(() => useChat());

    act(() => {
      void result.current.sendQuestion("first");
    });

    await act(async () => {
      await result.current.sendQuestion("second");
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    releaseStream();
  });
});
