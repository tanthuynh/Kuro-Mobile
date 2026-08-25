const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Support Firebase modular CJS bundles
config.resolver.sourceExts.push('cjs');

module.exports = config;
