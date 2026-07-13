export type TextClipboard = {
  writeText: (text: string) => Promise<void>;
};

export const copyText = (text: string, clipboard: TextClipboard) => clipboard.writeText(text);
