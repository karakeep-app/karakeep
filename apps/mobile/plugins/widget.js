/**
 * Expo Config Plugin for Karakeep Android Widget
 *
 * Adds native Android widget components to the Expo build:
 * - Copies Kotlin source files to the Android project
 * - Adds widget layouts and resources
 * - Registers the AppWidgetProvider in AndroidManifest.xml
 *
 * Usage in app.config.js:
 *   plugins: [
 *     ["./plugins/widget.js", {}],
 *   ]
 */

const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const WIDGET_PACKAGE = "app.karakeep.widget";

const KOTLIN_FILES = [
  "KarakeepWidgetProvider.kt",
  "KarakeepWidgetRemoteViewsFactory.kt",
  "KarakeepWidgetRemoteViewsService.kt",
  "KarakeepWidgetConfigActivity.kt",
  "KarakeepApi.kt",
];

const RESOURCE_FILES = {
  layout: ["widget_karakeep.xml", "widget_list_item.xml", "widget_list_item_loading.xml"],
  xml: ["karakeep_widget_info.xml"],
  values: ["colors.xml", "strings.xml"],
  "values-night": ["colors.xml"],
  drawable: ["widget_background.xml", "widget_item_background.xml"],
};

function copyWidgetFiles(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidProjectRoot = path.join(projectRoot, "android");

      const widgetSourceDir = path.join(projectRoot, "apps", "mobile", "native", "android-widget");
      const monorepoSourceDir = path.join(projectRoot, "..", "..", "native", "android-widget");

      const sourceDir = fs.existsSync(widgetSourceDir)
        ? widgetSourceDir
        : fs.existsSync(monorepoSourceDir)
        ? monorepoSourceDir
        : null;

      if (!sourceDir) {
        console.warn("[KarakeepWidget] Widget source directory not found, skipping");
        return config;
      }

      // Copy Kotlin files
      const javaDir = path.join(androidProjectRoot, "app", "src", "main", "java", ...WIDGET_PACKAGE.split("."));
      fs.mkdirSync(javaDir, { recursive: true });

      for (const file of KOTLIN_FILES) {
        const src = path.join(sourceDir, "app", "src", "main", "java", ...WIDGET_PACKAGE.split("."), file);
        const dest = path.join(javaDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          console.log(`[KarakeepWidget] Copied ${file}`);
        }
      }

      // Copy resource files
      const resDir = path.join(androidProjectRoot, "app", "src", "main", "res");
      for (const [subdir, files] of Object.entries(RESOURCE_FILES)) {
        const targetDir = path.join(resDir, subdir);
        fs.mkdirSync(targetDir, { recursive: true });
        for (const file of files) {
          const src = path.join(sourceDir, "app", "src", "main", "res", subdir, file);
          const dest = path.join(targetDir, file);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`[KarakeepWidget] Copied res/${subdir}/${file}`);
          }
        }
      }

      return config;
    },
  ]);
}

function addWidgetToManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainApplication = AndroidConfig.Manifest.getMainApplication(manifest);
    if (!mainApplication) return config;

    // Add widget provider receiver
    if (!mainApplication.receiver) mainApplication.receiver = [];
    if (!mainApplication.receiver.find((r) => r.$?.["android:name"] === `${WIDGET_PACKAGE}.KarakeepWidgetProvider`)) {
      mainApplication.receiver.push({
        $: { "android:name": `${WIDGET_PACKAGE}.KarakeepWidgetProvider`, "android:exported": "true" },
        "intent-filter": [{ action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }] }],
        "meta-data": [{ $: { "android:name": "android.appwidget.provider", "android:resource": "@xml/karakeep_widget_info" } }],
      });
      console.log("[KarakeepWidget] Added widget provider to manifest");
    }

    // Add config activity
    if (!mainApplication.activity) mainApplication.activity = [];
    if (!mainApplication.activity.find((a) => a.$?.["android:name"] === `${WIDGET_PACKAGE}.KarakeepWidgetConfigActivity`)) {
      mainApplication.activity.push({
        $: { "android:name": `${WIDGET_PACKAGE}.KarakeepWidgetConfigActivity`, "android:exported": "true", "android:label": "Widget Settings" },
        "intent-filter": [{ action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_CONFIGURE" } }] }],
      });
    }

    // Add widget service
    if (!mainApplication.service) mainApplication.service = [];
    if (!mainApplication.service.find((s) => s.$?.["android:name"] === `${WIDGET_PACKAGE}.KarakeepWidgetRemoteViewsService`)) {
      mainApplication.service.push({
        $: { "android:name": `${WIDGET_PACKAGE}.KarakeepWidgetRemoteViewsService`, "android:exported": "false", "android:permission": "android.permission.BIND_REMOTEVIEWS" },
      });
    }

    return config;
  });
}

function withKarakeepWidget(config) {
  config = copyWidgetFiles(config);
  config = addWidgetToManifest(config);
  return config;
}

module.exports = withKarakeepWidget;
