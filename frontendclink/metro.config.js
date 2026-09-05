const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Metro debe tratar los formatos 3D como recursos estáticos.
config.resolver.assetExts.push('glb', 'gltf', 'obj', 'bin');

module.exports = withNativeWind(config, { input: './src/global.css' });

