import Markdown from "react-native-markdown-display";
import { TailwindResolver } from "@/components/TailwindResolver";

export default function BookmarkTextMarkdown({ text }: { text: string }) {
  return (
    <TailwindResolver
      className="text-foreground"
      comp={(styles) => (
        <Markdown
          style={{
            text: {
              color: styles?.color?.toString(),
            },
          }}
        >
          {text}
        </Markdown>
      )}
    />
  );
}
