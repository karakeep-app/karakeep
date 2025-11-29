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
    grey6: "rgb(28, 28, 30)",
    grey5: "rgb(44, 44, 46)",
    grey4: "rgb(58, 58, 60)",
    grey3: "rgb(72, 72, 74)",
    grey2: "rgb(99, 99, 102)",
    grey: "rgb(142, 142, 147)",
    background: "rgb(0, 0, 0)",
    foreground: "rgb(255, 255, 255)",
    root: "rgb(0, 0, 0)",
    card: "rgb(28, 28, 30)",
    destructive: "rgb(255, 69, 58)",
    primary: "rgb(10, 132, 255)",
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
    grey6: "rgb(28, 27, 31)",
    grey5: "rgb(49, 48, 51)",
    grey4: "rgb(72, 70, 73)",
    grey3: "rgb(96, 93, 98)",
    grey2: "rgb(120, 116, 121)",
    grey: "rgb(147, 143, 153)",
    background: "rgb(20, 18, 24)",
    foreground: "rgb(230, 225, 229)",
    root: "rgb(20, 18, 24)",
    card: "rgb(28, 27, 31)",
    destructive: "rgb(242, 184, 181)",
    primary: "rgb(164, 200, 255)",
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
