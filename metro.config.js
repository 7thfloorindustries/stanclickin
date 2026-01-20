const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Packages that don't work on web - resolve to empty module
const nativeOnlyPackages = [
  "expo-notifications",
  "react-native-iap",
  "expo-haptics",
];

// For web builds, block these native-only modules
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && nativeOnlyPackages.includes(moduleName)) {
    return {
      filePath: require.resolve("./src/mocks/empty-module.js"),
      type: "sourceFile",
    };
  }
  // Fall back to default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
