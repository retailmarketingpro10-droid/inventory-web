import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Paperclip, Send, Loader2, Image as ImageIcon, FileText } from "lucide-react";
import { askReportAI, AIChatMessage, AIReportAttachment } from "@/services/aiReportService";
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
      setInput("");
      setFiles([]);
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
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Report Assistant (Gemini)</CardTitle>
        <CardDescription>
          Ask questions about this report or attach related files/screenshots. The AI will use the
          current report data and your files to explain and answer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-md h-64 md:h-72 bg-muted/40">
          <ScrollArea className="h-full p-3 space-y-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border border-border"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
          </ScrollArea>
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted"
              >
                {file.type.startsWith("image/") ? (
                  <ImageIcon className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                <span className="max-w-[150px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="ml-1 text-xs hover:text-destructive"
                  aria-label={`Remove ${file.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1">
            <Textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about totals, trends, definitions, or upload a report screenshot/file..."
            />
          </div>
          <div className="flex md:flex-col gap-2 md:w-32">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => {
                  const inputEl = document.getElementById(
                    "report-chat-file-input"
                  ) as HTMLInputElement | null;
                  inputEl?.click();
                }}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                id="report-chat-file-input"
                type="file"
                className="hidden"
                multiple
                accept="image/*,.csv,.tsv,.txt,.json,.pdf,.xlsx,.xls"
                onChange={handleFileChange}
              />
            </div>
            <Button
              type="button"
              className="shrink-0"
              onClick={handleSend}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Thinking...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Ask AI
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportChat;

