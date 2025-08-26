import { Platform } from "react-native";

const IOS_SYSTEM_COLORS = {
  white: "rgb(255, 255, 255)",
  black: "rgb(0, 0, 0)",
  light: {
    grey6: "rgb(242, 242, 247)",
    grey5: "rgb(230, 230, 235)",
    grey4: "rgb(210, 210, 215)",
    grey3: "rgb(199, 199, 204)",
    grey2: "rgb(176, 176, 181)",
    grey: "rgb(153, 153, 158)",
    background: "rgb(242, 242, 247)",
    foreground: "rgb(0, 0, 0)",
    root: "rgb(242, 242, 247)",
    card: "rgb(242, 242, 247)",
    destructive: "rgb(255, 56, 43)",
    primary: "rgb(0, 123, 255)",
  },
  dark: {
    grey6: "rgb(21, 21, 24)",
    grey5: "rgb(40, 40, 40)",
    grey4: "rgb(51, 51, 51)",
    grey3: "rgb(70, 70, 70)",
    grey2: "rgb(99, 99, 99)",
    grey: "rgb(158, 158, 158)",
    background: "rgb(0, 0, 0)",
    foreground: "rgb(255, 255, 255)",
    root: "rgb(0, 0, 0)",
    card: "rgb(0, 0, 0)",
    destructive: "rgb(254, 67, 54)",
    primary: "rgb(3, 133, 255)",
  },
} as const;

const ANDROID_COLORS = {
  white: "rgb(255, 255, 255)",
  black: "rgb(0, 0, 0)",
  light: {
    grey6: "rgb(242, 242, 247)",
    grey5: "rgb(230, 230, 235)",
    grey4: "rgb(210, 210, 215)",
    grey3: "rgb(199, 199, 204)",
    grey2: "rgb(176, 176, 181)",
    grey: "rgb(153, 153, 158)",
    background: "rgb(250, 252, 255)",
    foreground: "rgb(27, 28, 29)",
    root: "rgb(250, 252, 255)",
    card: "rgb(250, 252, 255)",
    destructive: "rgb(186, 26, 26)",
    primary: "rgb(0, 112, 233)",
  },
  dark: {
    grey6: "rgb(21, 21, 24)",
    grey5: "rgb(40, 40, 40)",
    grey4: "rgb(51, 51, 51)",
    grey3: "rgb(70, 70, 70)",
    grey2: "rgb(99, 99, 99)",
    grey: "rgb(158, 158, 158)",
    background: "rgb(24, 28, 32)",
    foreground: "rgb(221, 227, 233)",
    root: "rgb(24, 28, 32)",
    card: "rgb(24, 28, 32)",
    destructive: "rgb(147, 0, 10)",
    primary: "rgb(0, 69, 148)",
  },
} as const;

const WEB_COLORS = {
  white: "rgb(255, 255, 255)",
  black: "rgb(0, 0, 0)",
  light: {
    grey6: "rgb(250, 252, 255)",
    grey5: "rgb(243, 247, 251)",
    grey4: "rgb(236, 242, 248)",
    grey3: "rgb(233, 239, 247)",
    grey2: "rgb(229, 237, 245)",
    grey: "rgb(226, 234, 243)",
    background: "rgb(250, 252, 255)",
    foreground: "rgb(27, 28, 29)",
    root: "rgb(250, 252, 255)",
    card: "rgb(250, 252, 255)",
    destructive: "rgb(186, 26, 26)",
    primary: "rgb(0, 112, 233)",
  },
  dark: {
    grey6: "rgb(25, 30, 36)",
    grey5: "rgb(31, 38, 45)",
    grey4: "rgb(35, 43, 52)",
    grey3: "rgb(38, 48, 59)",
    grey2: "rgb(40, 51, 62)",
    grey: "rgb(44, 56, 68)",
    background: "rgb(24, 28, 32)",
    foreground: "rgb(221, 227, 233)",
    root: "rgb(24, 28, 32)",
    card: "rgb(24, 28, 32)",
    destructive: "rgb(147, 0, 10)",
    primary: "rgb(0, 69, 148)",
  },
} as const;

const COLORS =
  Platform.OS === "ios"
    ? IOS_SYSTEM_COLORS
    : Platform.OS === "android"
      ? ANDROID_COLORS
      : WEB_COLORS;

export { COLORS };
