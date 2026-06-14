export type ChatInputProps = {
  onSend: (message: string) => void;
  isStreaming: boolean;
  disabled?: boolean;
};
