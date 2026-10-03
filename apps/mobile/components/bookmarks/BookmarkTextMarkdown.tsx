import { useState } from "react";
import { Image } from "expo-image";
import Markdown from "react-native-markdown-display";
import { TailwindResolver } from "@/components/TailwindResolver";
import useAppSettings from "@/lib/settings";
import { buildApiHeaders } from "@/lib/utils";

function resolveImageSource(
  src: string,
  address: string,
  headers: Record<string, string>,
) {
  if (/^(https?:|data:)/i.test(src)) {
    return { uri: src };
  }
  return {
    uri: `${address}${src.startsWith("/") ? "" : "/"}${src}`,
    headers,
  };
}

function MarkdownImage({
  source,
  alt,
}: {
  source: { uri: string; headers?: Record<string, string> };
  alt?: string;
}) {
  const [aspectRatio, setAspectRatio] = useState(1);
  return (
    <Image
      source={source}
      style={{ width: "100%", aspectRatio }}
      contentFit="contain"
      accessible={!!alt}
      accessibilityLabel={alt}
      onLoad={(e) => {
        const { width, height } = e.source;
        if (width && height) {
          setAspectRatio(width / height);
        }
      }}
    />
  );
}

export default function BookmarkTextMarkdown({ text }: { text: string }) {
  const { settings } = useAppSettings();
  const headers = buildApiHeaders(settings.apiKey, settings.customHeaders);

  return (
    <TailwindResolver
      className="text-foreground"
      comp={(styles) => {
        const color = styles?.color?.toString();
        return (
          <Markdown
            style={{
              text: { color },
              // List bullets and numbers are rendered with these pseudo-class
              // styles and don't inherit from `text`, so they'd otherwise fall
              // back to the default black and be invisible in dark mode.
              bullet_list_icon: { color },
              ordered_list_icon: { color },
            }}
            rules={{
              image: (node) => {
                const { src, alt } = node.attributes;
                return (
                  <MarkdownImage
                    key={node.key}
                    source={resolveImageSource(src, settings.address, headers)}
                    alt={alt}
                  />
                );
              },
            }}
          >
            {text}
          </Markdown>
        );
      }}
    />
  );
}
