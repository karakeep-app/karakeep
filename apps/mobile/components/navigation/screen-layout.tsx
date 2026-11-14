import type { ReactElement } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

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
 * sheets away from the rail and Split View windows get the right inset. It
 * uses margin rather than padding so absolutely positioned children (FABs,
 * toolbars) move along with the content.
 *
 * Screens that are navigators themselves are passed through: their own
 * screens apply this, and wrapping them would also inset their headers.
 *
 * Modals and sheets are presented outside the app's SafeAreaProvider, so they
 * get their own. Without one, the SafeAreaView measures its own insets, and
 * moving itself by the margin changes them, which loops forever.
 */
export function horizontalSafeAreaLayout(nestedNavigators: string[] = []) {
  return function ScreenLayout({
    route,
    options,
    children,
  }: {
    route: { name: string };
    options: { presentation?: string };
    children: ReactElement;
  }) {
    if (nestedNavigators.includes(route.name)) {
      return children;
    }
    const content = (
      <SafeAreaView mode="margin" edges={HORIZONTAL_EDGES} style={{ flex: 1 }}>
        {children}
      </SafeAreaView>
    );
    if (options.presentation && options.presentation !== "card") {
      return <SafeAreaProvider>{content}</SafeAreaProvider>;
    }
    return content;
  };
}
