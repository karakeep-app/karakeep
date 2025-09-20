"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";

interface DateTimePickerProps {
  date?: Date | null;
  onDateChange?: (date: Date | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function DateTimePicker({
  date,
  onDateChange,
  placeholder = "Pick a date and time",
  disabled = false,
  className,
}: DateTimePickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    date ?? undefined,
  );
  const [hour, setHour] = useState<string>(date ? format(date, "HH") : "09");
  const [minute, setMinute] = useState<string>(
    date ? format(date, "mm") : "00",
  );

  useEffect(() => {
    if (date) {
      setSelectedDate(date);
      setHour(format(date, "HH"));
      setMinute(format(date, "mm"));
    }
  }, [date]);

  const handleDateSelect = (newDate: Date | undefined) => {
    setSelectedDate(newDate);
    if (newDate) {
      const updatedDate = new Date(newDate);
      updatedDate.setHours(parseInt(hour), parseInt(minute), 0, 0);
      onDateChange?.(updatedDate);
    } else {
      onDateChange?.(null);
    }
  };

  const handleTimeChange = (newHour: string, newMinute: string) => {
    setHour(newHour);
    setMinute(newMinute);
    if (selectedDate) {
      const updatedDate = new Date(selectedDate);
      updatedDate.setHours(parseInt(newHour), parseInt(newMinute), 0, 0);
      onDateChange?.(updatedDate);
    }
  };

  const displayValue = selectedDate
    ? `${format(selectedDate, "PPP")} at ${hour}:${minute}`
    : placeholder;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground",
            className,
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayValue}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            disabled={(date) =>
              date < new Date(new Date().setHours(0, 0, 0, 0))
            }
          />
          <div className="mt-3 border-t pt-3">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center space-x-1">
                <Input
                  type="number"
                  min="0"
                  max="23"
                  value={hour}
                  onChange={(e) => {
                    const val = e.target.value.padStart(2, "0");
                    if (parseInt(val) >= 0 && parseInt(val) <= 23) {
                      handleTimeChange(val, minute);
                    }
                  }}
                  className="w-[4.8rem] text-center"
                  placeholder="HH"
                />
                <span className="text-muted-foreground">:</span>
                <Input
                  type="number"
                  min="0"
                  max="59"
                  value={minute}
                  onChange={(e) => {
                    const val = e.target.value.padStart(2, "0");
                    if (parseInt(val) >= 0 && parseInt(val) <= 59) {
                      handleTimeChange(hour, val);
                    }
                  }}
                  className="w-[4.8rem] text-center"
                  placeholder="MM"
                />
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
