import { useCallback, useRef, useState } from "react";
import { Stack, useFocusEffect } from "expo-router";
import type { SearchBarCommands } from "react-native-screens";
import BookmarkSearchResults from "@/components/search/BookmarkSearchResults";
import { useBookmarkSearchState } from "@/lib/useBookmarkSearchState";

export default function SearchTab() {
  const [search, setSearch] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchBarRef = useRef<SearchBarCommands>(
    null,
  ) as React.RefObject<SearchBarCommands>;
  const state = useBookmarkSearchState(search);

  useFocusEffect(
    useCallback(() => {
      const id = setTimeout(() => searchBarRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }, []),
  );

  const handleSearchSubmit = (searchTerm: string) => {
    const term = searchTerm.trim();
    if (term.length > 0) {
      setSearch(term);
      searchBarRef.current?.setText(term);
      state.addTerm(term);
    }
    searchBarRef.current?.blur();
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            ref: searchBarRef,
            placeholder: "Search bookmarks...",
            onChangeText: (event) => setSearch(event.nativeEvent.text),
            onFocus: () => setIsSearchFocused(true),
            onBlur: () => {
              setIsSearchFocused(false);
              state.commitTerm(search);
            },
            onSearchButtonPress: () => handleSearchSubmit(search),
            autoCapitalize: "none",
            hideWhenScrolling: false,
          },
        }}
      />

      <BookmarkSearchResults
        rawSearch={search}
        isInputFocused={isSearchFocused}
        state={state}
        onSelectHistory={handleSearchSubmit}
      />
    </>
  );
}
