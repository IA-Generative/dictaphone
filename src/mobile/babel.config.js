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
    // E2E only: lets a build point at the mock DMZ (MIRAI_API_URL). Unset in
    // normal builds, so the production host below is used.
    ['transform-inline-environment-variables', { include: ['MIRAI_API_URL'] }],
    // must be the last one
    'react-native-worklets/plugin',
  ],
}
