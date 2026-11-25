import { useState } from "react";
import { ActivityIndicator, Alert, Pressable } from "react-native";
import { router, Stack } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
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
 * Asks before leaving the screen throws away unsaved input, whether by Cancel,
 * swiping a sheet down on iOS or Android's back. Call the returned function
 * right before navigating away after a successful save.
 */
function useDiscardGuard(isDirty: boolean) {
  const { t } = useTranslation();
  const [leaving, setLeaving] = useState(false);
  // Re-dispatching the blocked action gets blocked again (and loops until
  // React gives up and the app crashes). Leave through `repeat` or the
  // returned `disablePrevention` instead.
  const disablePrevention = usePreventRemove(
    isDirty && !leaving,
    ({ repeat }) => {
      Alert.alert(
        t("app.discard_changes_title"),
        t("app.discard_changes_message"),
        [
          { text: t("actions.keep_editing"), style: "cancel" },
          {
            text: t("actions.discard"),
            style: "destructive",
            onPress: () => {
              setLeaving(true);
              repeat();
            },
          },
        ],
      );
    },
  );
  return () => {
    setLeaving(true);
    disablePrevention();
  };
}

/**
 * Standard Cancel / Save header for form sheets, so the primary action never
 * ends up behind the keyboard. Pair it with useDiscardGuard so Cancel asks
 * before throwing away what was typed.
 */
function SheetHeader({
  title,
  onCancel = () => router.back(),
  onSave,
  saveLabel,
  saveDisabled = false,
  isSaving = false,
}: {
  title?: string;
  onCancel?: () => void;
  onSave: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  isSaving?: boolean;
}) {
  const { save, cancel } = useCommonActions();

  return (
    <Stack.Screen
      options={{
        ...(title ? { headerTitle: title } : {}),
        headerLeft: () => (
          <HeaderTextButton label={cancel} onPress={onCancel} />
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

export { HeaderTextButton, SheetHeader, useDiscardGuard };
