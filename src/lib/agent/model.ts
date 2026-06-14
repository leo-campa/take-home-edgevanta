export type AgentTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type ToolResult = {
  tool_use_id: string;
  content: string;
};

export type AgentChatResponse = {
  answer: string;
};
