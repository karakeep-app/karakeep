import { cn } from "@/lib/utils";

export default function TerminalCard({
  lines,
  className,
}: {
  lines: string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[#2b2540] bg-[#0e0b18]",
        className,
      )}
    >
      <div className="flex items-center gap-[7px] border-b border-[#2b2540] px-4 py-3">
        <div className="size-2.5 rounded-full bg-[#3b3355]" />
        <div className="size-2.5 rounded-full bg-[#3b3355]" />
        <div className="size-2.5 rounded-full bg-[#3b3355]" />
      </div>
      <div className="overflow-x-auto p-5 text-left font-mono text-[13.5px] leading-[2.1]">
        {lines.map((line) => (
          <div key={line} className="whitespace-nowrap">
            <span className="text-[#a78bfa]">$</span>{" "}
            <span className="text-neutral-200">{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
