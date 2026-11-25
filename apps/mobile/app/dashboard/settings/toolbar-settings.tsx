import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react-native";
import type { ToolbarActionId } from "@/lib/settings";
import { Fragment } from "react";
import { Pressable, View } from "react-native";
import {
  TOOLBAR_ACTION_REGISTRY,
  useToolbarActionLabels,
} from "@/components/bookmarks/BottomActions";
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
} from "@/components/settings/settings-list";
import { AppIcon } from "@/components/ui/AppIcon";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import useAppSettings, {
  DEFAULT_OVERFLOW_ACTIONS,
  DEFAULT_TOOLBAR_ACTIONS,
} from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react-native";

const MAX_VISIBLE = 6;

function RowButton({
  color,
  disabled = false,
  icon,
  label,
  onPress,
}: {
  color: string;
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        "h-12 w-11 items-center justify-center active:opacity-50",
        disabled && "opacity-25",
      )}
      disabled={disabled}
      onPress={onPress}
    >
      <AppIcon icon={icon} size={18} color={color} />
    </Pressable>
  );
}

function ActionRow({
  children,
  iconColor,
  id,
  label,
}: {
  children: ReactNode;
  iconColor: string;
  id: ToolbarActionId;
  label: string;
}) {
  return (
    <View className="flex-row items-center pl-4 pr-1">
      <AppIcon
        icon={TOOLBAR_ACTION_REGISTRY[id].Icon}
        size={20}
        color={iconColor}
      />
      <Text className="ml-3 flex-1">{label}</Text>
      {children}
    </View>
  );
}

export default function ToolbarSettingsPage() {
  const { settings, setSettings } = useAppSettings();
  const { t } = useTranslation();
  const { colors } = useColorScheme();
  const actionLabels = useToolbarActionLabels();

  const visible = settings.toolbarActions;
  const overflow = settings.overflowActions ?? [];

  const save = (
    nextVisible: ToolbarActionId[],
    nextOverflow: ToolbarActionId[],
  ) =>
    setSettings({
      ...settings,
      toolbarActions: nextVisible,
      overflowActions: nextOverflow,
    });

  const move = (index: number, offset: -1 | 1) => {
    const next = [...visible];
    const [id] = next.splice(index, 1);
    next.splice(index + offset, 0, id);
    save(next, overflow);
  };

  const buttonLabel = (label: string, id: ToolbarActionId) =>
    t("bookmark_actions.named_label", { label, name: actionLabels[id] });

  return (
    <SettingsScreen>
      <SettingsGroup
        header={t("settings.toolbar_visible", { max: MAX_VISIBLE })}
      >
        {visible.length === 0 ? (
          <View className="px-4 py-3">
            <Text className="text-sm text-muted-foreground">
              {t("settings.toolbar_visible_empty")}
            </Text>
          </View>
        ) : (
          visible.map((id, index) => (
            <Fragment key={id}>
              {index > 0 && <SettingsSeparator />}
              <ActionRow
                iconColor={colors.foreground}
                id={id}
                label={actionLabels[id]}
              >
                <RowButton
                  color={colors.icon}
                  disabled={index === 0}
                  icon={ChevronUp}
                  label={buttonLabel(t("settings.toolbar_move_up"), id)}
                  onPress={() => move(index, -1)}
                />
                <RowButton
                  color={colors.icon}
                  disabled={index === visible.length - 1}
                  icon={ChevronDown}
                  label={buttonLabel(t("settings.toolbar_move_down"), id)}
                  onPress={() => move(index, 1)}
                />
                <RowButton
                  color={colors.destructive}
                  icon={Minus}
                  label={buttonLabel(t("settings.toolbar_remove"), id)}
                  onPress={() =>
                    save(
                      visible.filter((a) => a !== id),
                      [...overflow, id],
                    )
                  }
                />
              </ActionRow>
            </Fragment>
          ))
        )}
      </SettingsGroup>

      <SettingsGroup header={t("settings.toolbar_overflow")}>
        {overflow.length === 0 ? (
          <View className="px-4 py-3">
            <Text className="text-sm text-muted-foreground">
              {t("settings.toolbar_overflow_empty")}
            </Text>
          </View>
        ) : (
          overflow.map((id, index) => (
            <Fragment key={id}>
              {index > 0 && <SettingsSeparator />}
              <ActionRow
                iconColor={colors.icon}
                id={id}
                label={actionLabels[id]}
              >
                <RowButton
                  color={colors.primary}
                  disabled={visible.length >= MAX_VISIBLE}
                  icon={Plus}
                  label={buttonLabel(t("settings.toolbar_add"), id)}
                  onPress={() =>
                    save(
                      [...visible, id],
                      overflow.filter((a) => a !== id),
                    )
                  }
                />
              </ActionRow>
            </Fragment>
          ))
        )}
      </SettingsGroup>

      <SettingsGroup>
        <SettingsActionRow
          centered
          label={t("settings.toolbar_reset")}
          onPress={() =>
            save([...DEFAULT_TOOLBAR_ACTIONS], [...DEFAULT_OVERFLOW_ACTIONS])
          }
          tone="primary"
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
