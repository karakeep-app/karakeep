const { withAndroidManifest } = require("@expo/config-plugins");

const withCameraNotRequired = (config) => {
  return withAndroidManifest(config, async (config) => {
    config.modResults = await setCustomConfigAsync(config, config.modResults);
    return config;
  });
};

async function setCustomConfigAsync(_config, androidManifest) {
  const usesFeature = androidManifest.manifest["uses-feature"] ?? [];
  usesFeature.push({
    $: {
      "android:name": "android.hardware.camera",
      "android:required": "false",
    },
  });
  androidManifest.manifest["uses-feature"] = usesFeature;

  return androidManifest;
}

module.exports = withCameraNotRequired;
