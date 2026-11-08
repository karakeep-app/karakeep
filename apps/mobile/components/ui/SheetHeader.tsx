import { useEffect, useRef } from "react";
import { ActivityIndicator, Alert, BackHandler, Pressable } from "react-native";
import { router, Stack, useIsFocused } from "expo-router";
import { Text } from "@/components/ui/Text";
import { useCommonActions, useTranslation } from "@/lib/i18n/hooks";

function HeaderTextButton({
  label,
  onPress,
  emphasized = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  emphasized?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      className="px-2 active:opacity-60"
    >
      <Text
        className={
          disabled
            ? "text-muted-foreground/60"
            : emphasized
              ? "font-semibold text-primary"
              : "text-primary"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Standard Cancel / Save header for form sheets, so the primary action never
 * ends up behind the keyboard.
 */
function SheetHeader({
  title,
  onCancel = () => router.back(),
  onSave,
  saveLabel,
  saveDisabled = false,
  isSaving = false,
  isDirty = false,
}: {
  title?: string;
  onCancel?: () => void;
  onSave: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  isSaving?: boolean;
  /** Asks before Cancel throws away what was typed. */
  isDirty?: boolean;
}) {
  const { t } = useTranslation();
  const { save, cancel } = useCommonActions();
  const handleCancel = () => {
    if (!isDirty) {
      onCancel();
      return;
    }
    Alert.alert(
      t("app.discard_changes_title"),
      t("app.discard_changes_message"),
      [
        { text: t("actions.keep_editing"), style: "cancel" },
        {
          text: t("actions.discard"),
          style: "destructive",
          onPress: onCancel,
        },
      ],
    );
  };

  // Android's system back would otherwise skip the Cancel guard. The latest
  // handler lives in a ref so re-renders while typing don't re-subscribe.
  // Only while focused: a picker pushed on top handles its own back.
  const handleCancelRef = useRef(handleCancel);
  handleCancelRef.current = handleCancel;
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isDirty || !isFocused) {
      return;
    }
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        handleCancelRef.current();
        return true;
      },
    );
    return () => subscription.remove();
  }, [isDirty, isFocused]);

  return (
    <Stack.Screen
      options={{
        ...(title ? { headerTitle: title } : {}),
        headerLeft: () => (
          <HeaderTextButton label={cancel} onPress={handleCancel} />
        ),
        headerRight: () =>
          isSaving ? (
            <ActivityIndicator className="px-2" size="small" />
          ) : (
            <HeaderTextButton
              label={saveLabel ?? save}
              onPress={onSave}
              emphasized
              disabled={saveDisabled}
            />
          ),
      }}
    />
  );
}

export { HeaderTextButton, SheetHeader };
