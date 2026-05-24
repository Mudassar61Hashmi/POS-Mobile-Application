const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

/**
 * Redirect react-native-svg/css to a stub module.
 * react-native-qrcode-svg imports this only for optional SVG logo support.
 * The css sub-package pulls in css-tree which Metro cannot resolve on Windows.
 */
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-svg/css') {
    return {
      filePath: path.resolve(__dirname, 'mocks/react-native-svg-css.js'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
