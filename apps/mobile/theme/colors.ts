const SYSTEM_COLORS = {
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

const COLORS = SYSTEM_COLORS;

export { COLORS };
