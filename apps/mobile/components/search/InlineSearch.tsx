import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BookmarkSearchResults from "@/components/search/BookmarkSearchResults";
import { TailwindResolver } from "@/components/TailwindResolver";
import { SearchInput } from "@/components/ui/SearchInput";
import { XIcon } from "lucide-react-native";

interface InlineSearchProps {
  onClose: () => void;
  rightElement?: React.ReactNode;
}

export default function InlineSearch({
  onClose,
  rightElement,
}: InlineSearchProps) {
  const [search, setSearch] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(true);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const handleSearchSubmit = () => {
    inputRef.current?.blur();
  };

  const handleSelectHistory = (term: string) => {
    setSearch(term);
    inputRef.current?.blur();
  };

  return (
    <View className="flex-1 bg-background">
      <View
        className="flex-row items-center gap-2 px-4 pb-2 pt-2"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-1">
          <SearchInput
            ref={inputRef}
            placeholder="Search bookmarks..."
            value={search}
            onChangeText={setSearch}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            autoFocus
            autoCapitalize="none"
          />
        </View>
        {rightElement}
        <Pressable onPress={onClose} className="p-1">
          <TailwindResolver
            className="text-muted-foreground"
            comp={(styles) => (
              <XIcon size={22} color={styles?.color?.toString()} />
            )}
          />
        </Pressable>
      </View>
      <BookmarkSearchResults
        query={search}
        isInputFocused={isInputFocused}
        onSelectHistory={handleSelectHistory}
      />
    </View>
  );
}
