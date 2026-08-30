import Markdown from "react-native-markdown-display";
import { TailwindResolver } from "@/components/TailwindResolver";

export default function BookmarkTextMarkdown({ text }: { text: string }) {
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
          >
            {text}
          </Markdown>
        );
      }}
    />
  );
}
