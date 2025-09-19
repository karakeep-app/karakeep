import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  ZWebhookEvent,
  zWebhookEventSchema,
} from "@karakeep/shared/types/webhooks";

export function WebhookEventSelector({
  value,
  onChange,
}: {
  value: ZWebhookEvent[];
  onChange: (value: ZWebhookEvent[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between"
        >
          {value.length > 0 ? value.join(", ") : "Select events"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <Command>
          <CommandInput placeholder="Search events..." />
          <CommandList>
            <CommandEmpty>No events found.</CommandEmpty>
            <CommandGroup>
              {zWebhookEventSchema.options.map((eventType) => (
                <CommandItem
                  key={eventType}
                  value={eventType}
                  onSelect={() => {
                    const newEvents = value.includes(eventType)
                      ? value.filter((e) => e !== eventType)
                      : [...value, eventType];
                    onChange(newEvents);
                  }}
                >
                  {eventType}
                  {value?.includes(eventType) && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
