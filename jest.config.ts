import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.scss$": "identity-obj-proxy",
    "^react-markdown$": "<rootDir>/src/__mocks__/react-markdown.tsx",
    "^remark-gfm$": "<rootDir>/src/__mocks__/remark-gfm.ts",
    "^pdfjs-dist/legacy/build/pdf\\.mjs$": "pdfjs-dist",
  },
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
        },
      },
    ],
  },
  testRegex: "\\.(test|spec)\\.(ts|tsx)$",
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/pages/_app.tsx",
    "!src/pages/_document.tsx",
  ],
};

export default config;
