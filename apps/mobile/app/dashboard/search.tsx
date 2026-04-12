import { useRef, useState } from "react";
import { Keyboard, Platform, Pressable, TextInput } from "react-native";
import { router, Stack } from "expo-router";
import BookmarkSearchResults from "@/components/search/BookmarkSearchResults";
import { SearchInput } from "@/components/ui/SearchInput";
import { useColorScheme } from "@/lib/useColorScheme";
import { X } from "lucide-react-native";

export default function Search() {
  const [search, setSearch] = useState("");
  const inputRef = useRef<TextInput>(null);
  const [isInputFocused, setIsInputFocused] = useState(true);
  const { colors } = useColorScheme();

  const handleSearchSubmit = () => {
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  const handleSelectHistory = (term: string) => {
    setSearch(term);
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  const searchInput = (
    <SearchInput
      containerClassName={Platform.select({ android: "m-3" })}
      ref={inputRef}
      placeholder="Search"
      className="flex-1"
      value={search}
      onChangeText={setSearch}
      onFocus={() => setIsInputFocused(true)}
      onBlur={() => setIsInputFocused(false)}
      onSubmitEditing={handleSearchSubmit}
      returnKeyType="search"
      autoFocus
      autoCapitalize="none"
      onCancel={Platform.select({ android: () => router.back() })}
    />
  );

  return (
    <>
      {Platform.OS === "ios" ? (
        <Stack.Screen
          options={{
            headerTitle: () => searchInput,
            headerRight: () => (
              <Pressable
                onPress={() => router.back()}
                accessibilityLabel="Close"
                accessibilityRole="button"
              >
                <X size={22} color={colors.foreground} />
              </Pressable>
            ),
          }}
        />
      ) : (
        searchInput
      )}
      <BookmarkSearchResults
        query={search}
        isInputFocused={isInputFocused}
        onSelectHistory={handleSelectHistory}
      />
    </>
  );
}
