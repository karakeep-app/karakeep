import { Text } from "@/components/ui/Text";
import { cx } from "class-variance-authority";

export default function PageTitle({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <Text className={cx("p-4 text-4xl font-bold text-foreground", className)}>
      {title}
    </Text>
  );
}
