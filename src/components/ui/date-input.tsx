import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "./input";

interface DateInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  placeholder?: string;
}

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, value, onChange, placeholder = "Pick a date", ...props }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
      value ? new Date(value) : undefined
    );

    // Update selectedDate when value prop changes
    React.useEffect(() => {
      if (value) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          setSelectedDate(date);
        }
      } else {
        setSelectedDate(undefined);
      }
    }, [value]);

    const handleSelect = (date: Date | undefined) => {
      setSelectedDate(date);
      if (date) {
        // Format date as YYYY-MM-DD for input value
        const formattedDate = format(date, "yyyy-MM-dd");
        onChange?.(formattedDate);
        setOpen(false);
      }
    };

    const displayValue = selectedDate ? format(selectedDate, "dd/MM/yyyy") : "";

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal pl-10 h-10",
              !selectedDate && "text-muted-foreground",
              "hover:border-primary/50 hover:bg-accent/50 transition-all duration-200",
              className
            )}
            ref={ref as any}
            {...(props as any)}
          >
            <CalendarIcon className="mr-3 h-5 w-5 text-primary/80" />
            {displayValue || <span className="text-muted-foreground">{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-auto p-0 shadow-xl z-50" 
          align="start" 
          side="bottom"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            initialFocus
            className="rounded-lg"
          />
          <div className="flex items-center justify-between p-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedDate(undefined);
                onChange?.("");
                setOpen(false);
              }}
              className="h-8 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
            >
              Clear
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = new Date();
                handleSelect(today);
              }}
              className="h-8 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
            >
              Today
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);
DateInput.displayName = "DateInput";

export { DateInput };
