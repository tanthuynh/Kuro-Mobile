const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const path = require('path');
// Support Firebase modular CJS bundles
config.resolver.sourceExts.push('cjs');

// Ignore project root build output folders from file map without affecting node_modules
const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
const defaultBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : [config.resolver.blockList].filter(Boolean);

config.resolver.blockList = [
  ...defaultBlockList,
  new RegExp('^' + escapeRegex(path.resolve(__dirname, 'dist')) + '([\\\\/].*)?$'),
  new RegExp('^' + escapeRegex(path.resolve(__dirname, 'web-build')) + '([\\\\/].*)?$'),
];

module.exports = config;
