import { TrafficDots } from "./MockupCard";

const cardShadow =
  "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-12px_rgba(15,23,42,0.16)]";

interface ScreenshotCardProps {
  src: string;
  alt: string;
  width: number;
  height: number;
}

/** Screenshot vignette inside a mini browser chrome. */
export function BrowserScreenshotCard({
  src,
  alt,
  width,
  height,
}: ScreenshotCardProps) {
  return (
    <div
      className={`w-full overflow-hidden rounded-xl border border-neutral-200/90 bg-white ${cardShadow}`}
    >
      <div className="flex h-[34px] items-center border-b border-neutral-100 bg-neutral-50 px-3.5">
        <TrafficDots />
      </div>
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="block h-auto w-full"
        loading="lazy"
      />
    </div>
  );
}

/** Screenshot vignette on a white padded "paper" card. */
export function PaperScreenshotCard({
  src,
  alt,
  width,
  height,
}: ScreenshotCardProps) {
  return (
    <div
      className={`w-full rounded-xl border border-neutral-200/90 bg-white p-5 ${cardShadow}`}
    >
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="block h-auto w-full rounded"
        loading="lazy"
      />
    </div>
  );
}
