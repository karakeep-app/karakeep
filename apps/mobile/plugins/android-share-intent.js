const {
  AndroidConfig,
  withAndroidManifest,
  createRunOncePlugin,
} = require("@expo/config-plugins");

const { getMainActivityOrThrow } = AndroidConfig.Manifest;

/**
 * Config plugin that configures Android share intent handling.
 *
 * This sets up:
 * 1. Intent filters on MainActivity for ACTION_SEND with specified MIME types
 * 2. launchMode="singleTask" on MainActivity to ensure single instance
 *
 * @param {object} config - Expo config
 * @param {object} props - Plugin props
 * @param {string[]} props.intentFilters - MIME types to handle (e.g. ["text/*", "image/*"])
 */
function withAndroidShareIntent(config, props = {}) {
  const intentFilters = props.intentFilters || [
    "text/*",
    "image/*",
    "application/pdf",
  ];

  config = withAndroidManifest(config, (config) => {
    const mainActivity = getMainActivityOrThrow(config.modResults);

    // Set launchMode to singleTask so the same activity instance receives
    // new intents via onNewIntent() instead of spawning new activities.
    mainActivity.$["android:launchMode"] = "singleTask";

    // Build intent filters for ACTION_SEND
    const shareIntentFilters = intentFilters.map((mimeType) => ({
      $: {
        "android:autoVerify": "true",
      },
      action: [{ $: { "android:name": "android.intent.action.SEND" } }],
      category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
      data: [{ $: { "android:mimeType": mimeType } }],
    }));

    // Initialize intent-filter array if it doesn't exist
    if (!mainActivity["intent-filter"]) {
      mainActivity["intent-filter"] = [];
    }

    // Add share intent filters
    mainActivity["intent-filter"].push(...shareIntentFilters);

    return config;
  });

  return config;
}

module.exports = createRunOncePlugin(
  withAndroidShareIntent,
  "android-share-intent",
  "1.0.0",
);
