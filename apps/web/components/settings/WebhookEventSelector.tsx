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
import { selectTriggerClass } from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/client";
import { Check, ChevronDown } from "lucide-react";

import {
  ZWebhookEvent,
  zWebhookEventSchema,
} from "@karakeep/shared/types/webhooks";

export function WebhookEventSelector({
  value,
  onChange,
  ...triggerAttributes
}: {
  value: ZWebhookEvent[];
  onChange: (value: ZWebhookEvent[]) => void;
} & Pick<
  React.ComponentProps<"button">,
  "id" | "aria-describedby" | "aria-invalid"
>) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          className={selectTriggerClass}
          {...triggerAttributes}
        >
          {value.length > 0 ? (
            <span className="truncate">{value.join(", ")}</span>
          ) : (
            <span className="text-muted-foreground/85">
              {t("settings.webhooks.events.select")}
            </span>
          )}
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={t("settings.webhooks.events.search")} />
          <CommandList>
            <CommandEmpty>
              {t("settings.webhooks.events.none_found")}
            </CommandEmpty>
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
                    <Check className="ml-auto size-4" />
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
