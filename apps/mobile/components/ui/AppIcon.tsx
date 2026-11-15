import type { LucideIcon } from "lucide-react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { Platform } from "react-native";
import { SymbolView } from "expo-symbols";
import {
  Archive,
  ArrowDownToLine,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleCheck,
  Clock3,
  Ellipsis,
  FileText,
  FolderOpen,
  Globe,
  Info,
  List,
  ListFilter,
  MessageSquareText,
  NotepadText,
  PenLine,
  Pencil,
  Plus,
  Search,
  SearchX,
  ShareIcon,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Users,
} from "lucide-react-native";

/**
 * iOS draws everything else (tab bar, menus, toolbars) in SF Symbols, so Lucide
 * glyphs next to them read as a second icon family. Lucide remains the fallback
 * on Android and for any icon without an entry here.
 */
const SF_SYMBOLS = new Map<LucideIcon, SFSymbol>([
  [Archive, "archivebox"],
  [ArrowDownToLine, "arrow.down.circle"],
  [BookOpen, "book"],
  [Bookmark, "bookmark"],
  [Check, "checkmark"],
  [ChevronDown, "chevron.down"],
  [ChevronUp, "chevron.up"],
  [Circle, "circle"],
  [CircleCheck, "checkmark.circle.fill"],
  [Clock3, "clock"],
  [Ellipsis, "ellipsis"],
  [FileText, "doc.text"],
  [FolderOpen, "folder"],
  [Globe, "safari"],
  [Info, "info.circle"],
  [List, "list.bullet"],
  [ListFilter, "line.3.horizontal.decrease.circle"],
  [MessageSquareText, "text.bubble"],
  [NotepadText, "note.text"],
  [PenLine, "highlighter"],
  [Pencil, "pencil"],
  [Plus, "plus"],
  [Search, "magnifyingglass"],
  [SearchX, "magnifyingglass"],
  [ShareIcon, "square.and.arrow.up"],
  [SlidersHorizontal, "slider.horizontal.3"],
  [Sparkles, "sparkles"],
  [Star, "star"],
  [Tag, "tag"],
  [Trash2, "trash"],
  [Users, "person.2"],
]);

export function AppIcon({
  icon: Icon,
  size = 20,
  color,
  filled = false,
  accessibilityLabel,
}: {
  icon: LucideIcon;
  size?: number;
  color: string;
  /** The solid form, used to show that something is on. */
  filled?: boolean;
  accessibilityLabel?: string;
}) {
  const symbol = SF_SYMBOLS.get(Icon);

  if (Platform.OS === "ios" && symbol) {
    return (
      <SymbolView
        name={(filled ? `${symbol}.fill` : symbol) as SFSymbol}
        size={size}
        tintColor={color}
        accessibilityLabel={accessibilityLabel}
        fallback={
          <Icon
            size={size}
            color={color}
            fill={filled ? color : "transparent"}
          />
        }
      />
    );
  }

  return (
    <Icon
      size={size}
      color={color}
      fill={filled ? color : "transparent"}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

/** A consistent "chosen / not chosen" mark for every multi-select picker row. */
export function SelectionIndicator({
  selected,
  selectedColor,
  color,
}: {
  selected: boolean;
  selectedColor: string;
  color: string;
}) {
  return selected ? (
    <AppIcon icon={CircleCheck} size={22} color={selectedColor} />
  ) : (
    <AppIcon icon={Circle} size={22} color={color} />
  );
}
