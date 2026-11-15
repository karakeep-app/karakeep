import Markdown from "react-native-markdown-display";
import { TailwindResolver } from "@/components/TailwindResolver";

export default function BookmarkTextMarkdown({
  text,
  size = "body",
  muted = false,
}: {
  text: string;
  size?: "body" | "subhead";
  muted?: boolean;
}) {
  const fontSize = size === "body" ? 17 : 15;
  const lineHeight = size === "body" ? 24 : 20;

  return (
    <TailwindResolver
      className={muted ? "text-muted-foreground" : "text-foreground"}
      comp={(styles) => {
        const color = styles?.color?.toString();
        return (
          <Markdown
            style={{
              text: { color },
              body: { fontSize, lineHeight },
              paragraph: { marginTop: 0, marginBottom: lineHeight / 2 },
              // List bullets and numbers are rendered with these pseudo-class
              // styles and don't inherit from `text`, so they'd otherwise fall
              // back to the default black and be invisible in dark mode.
              bullet_list_icon: { color },
              ordered_list_icon: { color },
            }}
          >
            {text}
          </Markdown>
        );
      }}
    />
  );
}
