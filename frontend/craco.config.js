const webpack = require('webpack');

module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      const fallback = webpackConfig.resolve.fallback || {};
      Object.assign(fallback, {
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        os: require.resolve('os-browserify'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer'),
        crypto: require.resolve('crypto-browserify'),
        assert: require.resolve('assert'),
        path: require.resolve('path-browserify'),
        url: require.resolve('url'),
        zlib: require.resolve('browserify-zlib'),
      });
      webpackConfig.resolve.fallback = fallback;

      webpackConfig.plugins = (webpackConfig.plugins || []).concat([
        new webpack.ProvidePlugin({
          process: 'process/browser',
          Buffer: ['buffer', 'Buffer'],
        }),
      ]);

      return webpackConfig;
    },
  },
};
