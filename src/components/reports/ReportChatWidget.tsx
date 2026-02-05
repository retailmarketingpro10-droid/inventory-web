import React, { useState } from "react";
import { MessageCircle } from "lucide-react";
import { ReportChat } from "@/components/reports/ReportChat";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ReportChatWidgetProps {
  reportContext: any;
}

/**
 * Floating chat launcher that stays fixed in the bottom-right corner
 * of the screen. Clicking the button toggles the full chat window,
 * similar to common support chat widgets.
 */
export const ReportChatWidget: React.FC<ReportChatWidgetProps> = ({
  reportContext,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = () => setIsOpen((prev) => !prev);

  return (
    <div className="fixed bottom-8 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {isOpen && (
        <div className="w-[360px] md:w-[420px] max-h-[80vh] shadow-2xl pointer-events-auto">
          <ReportChat reportContext={reportContext} />
        </div>
      )}

      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggle}
              aria-label={
                isOpen ? "Close AI report assistant" : "Open AI report assistant"
              }
              className="pointer-events-auto flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl hover:scale-[1.03] transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background border border-white/10"
            >
              <MessageCircle className="h-6 w-6" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" className="max-w-xs text-xs">
            <p className="font-medium mb-1">AI Report Assistant</p>
            <p>
              Ask questions about this report, its numbers, and business impact,
              or upload screenshots/files for a detailed explanation.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

