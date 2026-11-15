module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        alias: {
          '@': './src',
          crypto: 'react-native-quick-crypto',
          stream: 'readable-stream',
          buffer: 'react-native-quick-crypto',
        },
      },
    ],
    // E2E only: MIRAI_API_URL points a build at the mock DMZ, MIRAI_E2E
    // enables simulator workarounds (src/e2e.ts). Both unset in store builds.
    ['transform-inline-environment-variables', { include: ['MIRAI_API_URL', 'MIRAI_E2E'] }],
    // must be the last one
    'react-native-worklets/plugin',
  ],
}
