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
  // Proxy NEAR RPC through the dev server in local development so browser
  // fetch() calls are same-origin (rpc.testnet.near.org does not emit
  // Access-Control-Allow-Origin, which would otherwise trigger CORS blocks).
  devServer: (config) => {
    return {
      ...config,
      proxy: {
        ...(config.proxy || {}),
        '/near-rpc': {
          target: 'https://rpc.testnet.near.org',
          changeOrigin: true,
          secure: false,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        },
        // Proxy the public IPFS gateway through the dev server in local
        // development so browser fetch() calls are same-origin. w3s.link does
        // not emit Access-Control-Allow-Origin, which otherwise triggers CORS
        // blocks when downloading protected files from http://localhost:3000.
        '/ipfs': {
          target: 'https://w3s.link',
          changeOrigin: true,
          secure: false,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        },
      },
    };
  },
};
