import type { ToolbarActionId } from "@/lib/settings";
import { useCallback } from "react";
import { Pressable, ScrollView, TouchableOpacity, View } from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { TOOLBAR_ACTION_REGISTRY } from "@/components/bookmarks/BottomActions";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Divider } from "@/components/ui/Divider";
import { Text } from "@/components/ui/Text";
import useAppSettings, {
  DEFAULT_OVERFLOW_ACTIONS,
  DEFAULT_TOOLBAR_ACTIONS,
} from "@/lib/settings";
import { GripVertical, Minus, Plus } from "lucide-react-native";

const MAX_VISIBLE = 6;

export default function ToolbarSettingsPage() {
  const { settings, setSettings } = useAppSettings();

  const visible = settings.toolbarActions;
  const overflow = settings.overflowActions ?? [];

  const save = useCallback(
    (nextVisible: ToolbarActionId[], nextOverflow: ToolbarActionId[]) => {
      setSettings({
        ...settings,
        toolbarActions: nextVisible,
        overflowActions: nextOverflow,
      });
    },
    [settings, setSettings],
  );

  const demoteToOverflow = useCallback(
    (id: ToolbarActionId) => {
      save(
        visible.filter((a) => a !== id),
        [...overflow, id],
      );
    },
    [visible, overflow, save],
  );

  const promoteToVisible = useCallback(
    (id: ToolbarActionId) => {
      if (visible.length >= MAX_VISIBLE) return;
      save(
        [...visible, id],
        overflow.filter((a) => a !== id),
      );
    },
    [visible, overflow, save],
  );

  const resetToDefaults = () => {
    save([...DEFAULT_TOOLBAR_ACTIONS], [...DEFAULT_OVERFLOW_ACTIONS]);
  };

  const renderVisibleItem = useCallback(
    ({
      item,
      drag,
      isActive,
    }: {
      item: ToolbarActionId;
      drag: () => void;
      isActive: boolean;
    }) => {
      const meta = TOOLBAR_ACTION_REGISTRY[item];
      return (
        <ScaleDecorator>
          <TouchableOpacity
            activeOpacity={0.7}
            onLongPress={drag}
            disabled={isActive}
            className="flex flex-row items-center gap-3 bg-card px-4 py-3"
          >
            <TailwindResolver
              className="text-muted-foreground"
              comp={(styles) => (
                <GripVertical size={18} color={styles?.color?.toString()} />
              )}
            />
            <TailwindResolver
              className="text-foreground"
              comp={(styles) => (
                <meta.Icon size={20} color={styles?.color?.toString()} />
              )}
            />
            <Text className="flex-1">{meta.label}</Text>
            <Pressable onPress={() => demoteToOverflow(item)} className="p-1.5">
              <TailwindResolver
                className="text-muted-foreground"
                comp={(styles) => (
                  <Minus size={18} color={styles?.color?.toString()} />
                )}
              />
            </Pressable>
          </TouchableOpacity>
        </ScaleDecorator>
      );
    },
    [demoteToOverflow],
  );

  const renderOverflowItem = useCallback(
    ({
      item,
      drag,
      isActive,
    }: {
      item: ToolbarActionId;
      drag: () => void;
      isActive: boolean;
    }) => {
      const meta = TOOLBAR_ACTION_REGISTRY[item];
      const canPromote = visible.length < MAX_VISIBLE;
      return (
        <ScaleDecorator>
          <TouchableOpacity
            activeOpacity={0.7}
            onLongPress={drag}
            disabled={isActive}
            className="flex flex-row items-center gap-3 bg-card px-4 py-3"
          >
            <TailwindResolver
              className="text-muted-foreground"
              comp={(styles) => (
                <GripVertical size={18} color={styles?.color?.toString()} />
              )}
            />
            <TailwindResolver
              className="text-muted-foreground"
              comp={(styles) => (
                <meta.Icon size={20} color={styles?.color?.toString()} />
              )}
            />
            <Text className="flex-1 text-muted-foreground">{meta.label}</Text>
            <Pressable
              onPress={() => promoteToVisible(item)}
              disabled={!canPromote}
              className="p-1.5"
            >
              <TailwindResolver
                className={
                  canPromote
                    ? "text-muted-foreground"
                    : "text-muted-foreground/30"
                }
                comp={(styles) => (
                  <Plus size={18} color={styles?.color?.toString()} />
                )}
              />
            </Pressable>
          </TouchableOpacity>
        </ScaleDecorator>
      );
    },
    [visible.length, promoteToVisible],
  );

  return (
    <ScrollView
      className="w-full"
      contentContainerClassName="gap-4 px-4 py-2"
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text className="px-1 text-xs uppercase tracking-wide text-muted-foreground">
        Visible Actions (max {MAX_VISIBLE})
      </Text>
      <View
        className="w-full overflow-hidden rounded-xl bg-card"
        style={{ borderCurve: "continuous" }}
      >
        {visible.length === 0 ? (
          <View className="px-4 py-3">
            <Text className="text-sm text-muted-foreground">
              No visible actions. Only the overflow menu will show.
            </Text>
          </View>
        ) : (
          <DraggableFlatList
            data={visible}
            renderItem={renderVisibleItem}
            keyExtractor={(item) => item}
            onDragEnd={({ data }) => save(data, overflow)}
            scrollEnabled={false}
            ItemSeparatorComponent={() => (
              <Divider orientation="horizontal" className="mx-6" />
            )}
          />
        )}
      </View>

      <Text className="px-1 text-xs uppercase tracking-wide text-muted-foreground">
        Overflow Actions
      </Text>
      <View
        className="w-full overflow-hidden rounded-xl bg-card"
        style={{ borderCurve: "continuous" }}
      >
        {overflow.length === 0 ? (
          <View className="px-4 py-3">
            <Text className="text-sm text-muted-foreground">
              No overflow actions. All actions are visible on the toolbar.
            </Text>
          </View>
        ) : (
          <DraggableFlatList
            data={overflow}
            renderItem={renderOverflowItem}
            keyExtractor={(item) => item}
            onDragEnd={({ data }) => save(visible, data)}
            scrollEnabled={false}
            ItemSeparatorComponent={() => (
              <Divider orientation="horizontal" className="mx-6" />
            )}
          />
        )}
      </View>

      <Pressable
        onPress={resetToDefaults}
        className="w-full rounded-xl bg-card px-4 py-3"
        style={{ borderCurve: "continuous" }}
      >
        <Text className="text-center text-blue-500">Reset to Defaults</Text>
      </Pressable>
    </ScrollView>
  );
}
