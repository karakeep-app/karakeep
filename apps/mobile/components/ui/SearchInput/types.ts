import type { TextInputInstance, TextInputProps } from "react-native";

interface SearchInputProps extends TextInputProps {
  containerClassName?: string;
  iconContainerClassName?: string;
  cancelText?: string;
  iconColor?: string;
  onCancel?: () => void;
}

type SearchInputRef = TextInputInstance;

export type { SearchInputProps, SearchInputRef };
