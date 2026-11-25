import type { ReactElement } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const HORIZONTAL_EDGES = ["left", "right"] as const;

/**
 * A navigator `screenLayout` that keeps screen content clear of the left and
 * right safe area insets. On iPhone Duo's inner display, iOS moves the status
 * bar, headers and tab bar into a vertical rail on one edge and reports it as
 * a horizontal inset. Native headers and tab bars already avoid it; this does
 * the same for the content below them. Elsewhere these insets are 0 because
 * the app is portrait-only.
 *
 * The native SafeAreaView measures where the screen actually is, so form
 * sheets away from the rail and Split View windows get the right inset.
 *
 * It uses padding, not margin. Screens in a modal or sheet (and cards pushed
 * inside one) sit outside the app's SafeAreaProvider, so the SafeAreaView
 * measures its own insets there. A margin would move it by those insets and
 * change them, which loops forever; padding leaves its frame alone. The inner
 * view keeps absolutely positioned children (FABs, toolbars) inside the
 * padding too.
 *
 * Screens that are navigators themselves are passed through: their own
 * screens apply this, and wrapping them would also inset their headers.
 */
export function horizontalSafeAreaLayout(nestedNavigators: string[] = []) {
  return function ScreenLayout({
    route,
    children,
  }: {
    route: { name: string };
    children: ReactElement;
  }) {
    if (nestedNavigators.includes(route.name)) {
      return children;
    }
    return (
      <SafeAreaView mode="padding" edges={HORIZONTAL_EDGES} style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaView>
    );
  };
}
