import type { TextInput, TextInputProps } from "react-native";

interface SearchInputProps extends TextInputProps {
  containerClassName?: string;
  iconContainerClassName?: string;
  cancelText?: string;
  iconColor?: string;
  onCancel?: () => void;
}

type SearchInputRef = TextInput;

export type { SearchInputProps, SearchInputRef };
