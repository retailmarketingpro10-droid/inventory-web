import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Paperclip, Send, Loader2, Image as ImageIcon, FileText, ShieldCheck } from "lucide-react";
import { askReportAI, AIChatMessage, AIReportAttachment, checkGeminiKey, KeyStatusResult } from "@/services/aiReportService";
import { useToast } from "@/hooks/use-toast";

interface ReportChatProps {
  reportContext: any;
}

const MAX_TEXT_FILE_PREVIEW_CHARS = 20000;

export const ReportChat: React.FC<ReportChatProps> = ({ reportContext }) => {
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      role: "assistant",
      content:
        "I can explain this report, its fields, and how the main figures are calculated. Ask me anything about the numbers, trends, or definitions.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [keyStatus, setKeyStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [keyStatusMessage, setKeyStatusMessage] = useState<string>("");
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(event.target.files || []);
    if (newFiles.length === 0) return;
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = (reader.result as string) || "";
        resolve(
          text.length > MAX_TEXT_FILE_PREVIEW_CHARS
            ? text.slice(0, MAX_TEXT_FILE_PREVIEW_CHARS) + "\n...[truncated]..."
            : text
        );
      };
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  };

  const buildAttachments = async (selectedFiles: File[]): Promise<AIReportAttachment[]> => {
    const attachments: AIReportAttachment[] = [];

    for (const file of selectedFiles) {
      if (file.type.startsWith("image/")) {
        const base64 = await readFileAsBase64(file);
        attachments.push({
          kind: "image",
          fileName: file.name,
          mimeType: file.type,
          data: base64,
        });
      } else {
        // Treat other file types as text where possible (CSV, JSON, plain text, etc.)
        const text = await readFileAsText(file);
        attachments.push({
          kind: "text",
          fileName: file.name,
          data: text,
        });
      }
    }

    return attachments;
  };

  const handleCheckKey = async () => {
    setKeyStatus("checking");
    setKeyStatusMessage("");
    try {
      const result: KeyStatusResult = await checkGeminiKey();
      if (result.ok) {
        setKeyStatus("valid");
      } else {
        setKeyStatus("invalid");
      }
      setKeyStatusMessage(result.message);
    } catch (error: any) {
      setKeyStatus("invalid");
      const msg = error?.message || "Failed to check API key.";
      setKeyStatusMessage(msg);
      toast({
        title: "API key check failed",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed && files.length === 0) {
      return;
    }

    if (!reportContext) {
      toast({
        title: "No report available",
        description: "Generate a report first, then ask the AI about it.",
        variant: "destructive",
      });
      return;
    }

    const userMessage: AIChatMessage = {
      role: "user",
      content: trimmed || "(no text, only attachments)",
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const attachments = await buildAttachments(files);

      const answer = await askReportAI({
        question: trimmed,
        reportContext,
        history: [...messages, userMessage],
        attachments,
      });

      const assistantMessage: AIChatMessage = {
        role: "assistant",
        content: answer,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("AI chat error:", error);
      toast({
        title: "AI error",
        description:
          error?.message || "The AI service failed to answer your question.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      // Always clear the composer after a send attempt
      setInput("");
      setFiles([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Press Enter to send, Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) {
        void handleSend();
      }
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    const newFiles: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          newFiles.push(file);
        }
      }
    }

    if (newFiles.length > 0) {
      // Prevent pasting binary data as text into the textarea
      event.preventDefault();
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>AI Report Assistant (Gemini)</CardTitle>
          <CardDescription>
            Ask questions about this report or attach related files/screenshots. The AI will use the
            current report data and your files to explain and answer.
          </CardDescription>
        </div>
        <div className="flex flex-col items-start md:items-end gap-1 text-xs">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
            onClick={handleCheckKey}
            disabled={keyStatus === "checking"}
          >
            {keyStatus === "checking" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking key...
              </>
            ) : (
              <>
                <ShieldCheck className="h-3 w-3" />
                Check API key
              </>
            )}
          </Button>
          {keyStatus !== "idle" && (
            <span
              className={
                keyStatus === "valid"
                  ? "text-green-500"
                  : keyStatus === "invalid"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }
            >
              {keyStatus === "valid"
                ? "API key is valid."
                : keyStatus === "invalid"
                ? "API key is invalid or not working."
                : ""}
            </span>
          )}
          {keyStatusMessage && (
            <span className="max-w-xs text-muted-foreground text-[0.7rem] text-right">
              {keyStatusMessage}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-lg h-64 md:h-72 bg-muted/40">
          <ScrollArea className="h-full p-4 space-y-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm whitespace-pre-wrap ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-background border border-border rounded-bl-none"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
          </ScrollArea>
        </div>

        {files.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-3">
            {files.map((file, index) =>
              file.type.startsWith("image/") ? (
                <div
                  key={`${file.name}-${index}`}
                  className="relative w-20 h-20 rounded-md border bg-background overflow-hidden"
                >
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute top-1 right-1 rounded-full bg-black/60 text-white text-[10px] px-1"
                    aria-label={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 px-2 py-1 rounded-md border bg-background text-xs max-w-xs"
                >
                  <FileText className="h-3 w-3" />
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="ml-auto text-destructive"
                    aria-label={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </div>
              )
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="relative">
            <Textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Ask about totals, trends, definitions, or upload/paste a report screenshot/file..."
              className="w-full rounded-full bg-background border px-10 pr-20 py-2 resize-none leading-relaxed"
            />

            {/* Attach (image / file) button inside the input on the left */}
            <button
              type="button"
              onClick={() => {
                const inputEl = document.getElementById(
                  "report-chat-file-input"
                ) as HTMLInputElement | null;
                inputEl?.click();
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Attach image or file"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {/* Hidden file input triggered by the paperclip button */}
            <Input
              id="report-chat-file-input"
              type="file"
              className="hidden"
              multiple
              accept="image/*,.csv,.tsv,.txt,.json,.pdf,.xlsx,.xls"
              onChange={handleFileChange}
            />

            {/* Send icon button inside the input on the right */}
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80 disabled:opacity-50"
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportChat;

