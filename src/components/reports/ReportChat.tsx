import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Paperclip, Send, Loader2, Image as ImageIcon, FileText, ShieldCheck, Copy } from "lucide-react";
import { askReportAI, AIChatMessage, AIReportAttachment, checkGeminiKey, KeyStatusResult, getSuggestedQuestions } from "@/services/aiReportService";
import { useToast } from "@/hooks/use-toast";

interface ReportChatProps {
  reportContext: any;
  storageKey?: string;
}

const MAX_TEXT_FILE_PREVIEW_CHARS = 20000;

const getWelcomeMessage = (reportName?: string, reportId?: string): string => {
  const reportLabel = reportName || "this report";
  return `I can explain ${reportLabel}, its fields, and how the main figures are calculated. Ask me anything about the numbers, trends, or definitions. You can also attach images or files (PDF, Excel, CSV) for me to analyze alongside the report.`;
};

export const ReportChat: React.FC<ReportChatProps> = ({ reportContext, storageKey }) => {
  const suggestedQuestions = useMemo(
    () => getSuggestedQuestions(reportContext?.reportId || ""),
    [reportContext?.reportId]
  );
  const initialMessages = useMemo<AIChatMessage[]>(
    () => [
      {
        role: "assistant",
        content: getWelcomeMessage(reportContext?.reportName, reportContext?.reportId),
        timestamp: new Date().toISOString(),
      },
    ],
    [reportContext?.reportName, reportContext?.reportId]
  );

  const [messages, setMessages] = useState<AIChatMessage[]>(() => {
    if (!storageKey) return initialMessages;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return initialMessages;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as AIChatMessage[];
      }
      return initialMessages;
    } catch {
      return initialMessages;
    }
  });
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [keyStatus, setKeyStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [keyStatusMessage, setKeyStatusMessage] = useState<string>("");
  const { toast } = useToast();

  // Reload messages if storageKey changes (e.g. company/report changes).
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setMessages(initialMessages);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setMessages(parsed as AIChatMessage[]);
      } else {
        setMessages(initialMessages);
      }
    } catch {
      setMessages(initialMessages);
    }
  }, [storageKey, initialMessages]);

  // Persist messages so collapsing/expanding keeps history.
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore storage errors
    }
  }, [storageKey, messages]);

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

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    // Press Enter to send, Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) {
        void handleSend();
      }
    }
  };

  const handlePaste = (
    event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
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
    <Card className="bg-card/95 border border-border/70 shadow-lg rounded-2xl overflow-hidden">
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold tracking-tight">
            AI Report Assistant
          </CardTitle>
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
      <CardContent className="space-y-3 pt-1">
        <div className="border border-border/70 rounded-2xl h-80 md:h-[26rem] bg-background/90">
          <ScrollArea className="h-full p-4">
            <div className="flex flex-col gap-3">
              {messages.length === 1 && suggestedQuestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className="text-[10px] text-muted-foreground w-full">Try asking:</span>
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setInput(q)}
                      className="text-[10px] px-2 py-1 rounded-full bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50 transition-colors text-left max-w-full truncate"
                      title={q}
                    >
                      {q.length > 45 ? q.slice(0, 45) + "…" : q}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`relative max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug whitespace-pre-wrap ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-none"
                        : "bg-muted text-muted-foreground rounded-bl-none border border-border/60"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(message.content);
                            toast({
                              title: "Copied",
                              description: "AI response copied to clipboard.",
                            });
                          } catch {
                            toast({
                              title: "Copy failed",
                              description: "Could not copy to clipboard.",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                        aria-label="Copy AI response"
                        title="Copy"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {message.content}
                  </div>
                </div>
              ))}
            </div>
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

        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2">
            {/* Attach (image / file) button on the left, outside the input */}
            <button
              type="button"
              onClick={() => {
                const inputEl = document.getElementById(
                  "report-chat-file-input"
                ) as HTMLInputElement | null;
                inputEl?.click();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground hover:text-foreground hover:bg-background"
              aria-label="Attach image or file"
            >
              <Paperclip className="h-3 w-3" />
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

            {/* Thin input pill (single-line) */}
            <Input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Ask AI..."
              className="flex-1 h-7 rounded-full bg-background/95 border border-border/60 px-3 text-[11px] leading-none whitespace-nowrap overflow-x-auto focus-visible:outline-none focus-visible:ring-0 focus:outline-none focus:ring-0 focus:border-border/60"
            />

            {/* Send icon button on the right, outside the input */}
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportChat;

