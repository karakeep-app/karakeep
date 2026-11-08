"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Minus, Plus } from "lucide-react";

import { ButtonWithTooltip } from "./button";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, "aria-label": ariaLabel, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={ariaLabel}
      className="block h-5 w-5 rounded-full border-2 border-primary bg-background transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

/**
 * A slider between − and + steppers, with its value in one place at the end. A
 * drag previews through `onValueChange`, and every finished change, by drag,
 * keyboard or stepper, lands on `onValueCommit`.
 */
function StepperSlider({
  label,
  decreaseLabel,
  increaseLabel,
  value,
  displayValue,
  min,
  max,
  step,
  disabled,
  onValueChange,
  onValueCommit,
}: {
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  value: number;
  displayValue: React.ReactNode;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onValueChange?: (value: number) => void;
  onValueCommit: (value: number) => void;
}) {
  const stepBy = (delta: number) => {
    // Steps such as 0.1 would otherwise drift, 1.5 + 0.1 isn't 1.6 in floats.
    const next = Math.round((value + delta) / step) * step;
    onValueCommit(Math.min(max, Math.max(min, Number(next.toFixed(4)))));
  };
  const stepperClass = "shrink-0 text-muted-foreground max-sm:size-11";
  return (
    <div className="flex items-center gap-2">
      <ButtonWithTooltip
        type="button"
        variant="outline"
        size="icon-sm"
        tooltip={decreaseLabel}
        aria-label={decreaseLabel}
        className={stepperClass}
        disabled={disabled || value <= min}
        onClick={() => stepBy(-step)}
      >
        <Minus className="size-4" />
      </ButtonWithTooltip>
      <Slider
        aria-label={label}
        className="min-w-0 flex-1"
        disabled={disabled}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onValueChange?.(next)}
        onValueCommit={([next]) => onValueCommit(next)}
      />
      <ButtonWithTooltip
        type="button"
        variant="outline"
        size="icon-sm"
        tooltip={increaseLabel}
        aria-label={increaseLabel}
        className={stepperClass}
        disabled={disabled || value >= max}
        onClick={() => stepBy(step)}
      >
        <Plus className="size-4" />
      </ButtonWithTooltip>
      <span className="w-11 shrink-0 text-end text-sm tabular-nums text-muted-foreground">
        {displayValue}
      </span>
    </div>
  );
}

export { Slider, StepperSlider };
