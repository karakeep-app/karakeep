module.exports = function (api) {
  api.cache(true);
  const plugins = [];
  plugins.push("react-native-reanimated/plugin");
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins,
  };
};
