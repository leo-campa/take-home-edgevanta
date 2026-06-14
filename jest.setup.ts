import "@testing-library/jest-dom";
import {
  ReadableStream,
  TransformStream,
  WritableStream,
} from "node:stream/web";
import { TextDecoder, TextEncoder } from "node:util";

Object.assign(globalThis, {
  TextEncoder,
  TextDecoder,
  ReadableStream,
  WritableStream,
  TransformStream,
});

if (typeof window !== "undefined") {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
}
