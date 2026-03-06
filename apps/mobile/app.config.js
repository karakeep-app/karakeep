export default {
  expo: {
    name: "Karakeep",
    slug: "hoarder",
    scheme: "karakeep",
    version: "1.9.1",
    orientation: "portrait",
    icon: {
      light: "./assets/icon.png",
      tinted: "./assets/icon-tinted.png",
    },
    experiments: {
      reactCanary: true,
    },
    userInterfaceStyle: "automatic",
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "app.hoarder.hoardermobile",
      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          image: "./assets/splash-white.png",
          resizeMode: "contain",
          backgroundColor: "#000000",
        },
      },
      config: {
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
      },
      buildNumber: "36",
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#000000",
        monochromeImage: "./assets/adaptive-icon.png",
      },
      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          image: "./assets/splash-white.png",
          resizeMode: "contain",
          backgroundColor: "#000000",
        },
      },
      package: "app.hoarder.hoardermobile",
      versionCode: 36,
    },
    plugins: [
      "./plugins/trust-local-certs.js",
      "./plugins/camera-not-required.js",
      "expo-router",
      [
        "expo-share-intent",
        {
          iosActivationRules: {
            NSExtensionActivationSupportsWebURLWithMaxCount: 1,
            NSExtensionActivationSupportsWebPageWithMaxCount: 1,
            NSExtensionActivationSupportsImageWithMaxCount: 1,
            NSExtensionActivationSupportsMovieWithMaxCount: 0,
            NSExtensionActivationSupportsText: true,
            NSExtensionActivationSupportsFileWithMaxCount: 10,
            NSExtensionActivationRule:
              'SUBQUERY (extensionItems, $extensionItem, SUBQUERY ($extensionItem.attachments, $attachment, SUBQUERY ($attachment.registeredTypeIdentifiers, $uti, $uti UTI-CONFORMS-TO "com.adobe.pdf" || $uti UTI-CONFORMS-TO "public.image" || $uti UTI-CONFORMS-TO "public.url" || $uti UTI-CONFORMS-TO "public.plain-text").@count >= 1).@count >= 1).@count >= 1',
          },
          androidIntentFilters: ["text/*", "image/*", "application/pdf"],
        },
      ],
      "expo-secure-store",
      [
        "expo-image-picker",
        {
          photosPermission:
            "The app access your photo gallary on your request to hoard them.",
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: true,
            targetSdkVersion: 35,
            ndkVersion: "27.1.12297006",
          },
        },
      ],
      "expo-web-browser",
    ],
    extra: {
      router: {
        origin: false,
      },
      eas: {
        projectId: "d6d14643-ad43-4cd3-902a-92c5944d5e45",
      },
    },
  },
};
