import { useColorScheme } from "@/lib/useColorScheme";
import { ChevronRightIcon } from "lucide-react-native";

export default function ChevronRight({
  color,
  ...props
}: React.ComponentProps<typeof ChevronRightIcon>) {
  const { colors } = useColorScheme();

  return <ChevronRightIcon color={color ?? colors.grey} {...props} />;
}
