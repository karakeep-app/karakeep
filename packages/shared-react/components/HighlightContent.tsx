import React from "react";

import type { ZHighlightContent } from "@karakeep/shared/types/highlights";

export default function HighlightContent({
  content,
  text,
  allowImages = false,
}: {
  content?: ZHighlightContent | null;
  text: string | null;
  allowImages?: boolean;
}) {
  return (
    <div className="whitespace-pre-wrap text-left">
      {content?.parts.length
        ? content.parts.map((part, index) =>
            part.type === "text" ? (
              <span key={index}>{part.text}</span>
            ) : allowImages && /^https?:\/\//i.test(part.src) ? (
              <img
                key={index}
                src={part.src}
                alt={part.alt}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="my-2 h-auto max-w-full"
              />
            ) : (
              <span key={index}>[{part.alt || "Image"}]</span>
            ),
          )
        : text}
    </div>
  );
}
