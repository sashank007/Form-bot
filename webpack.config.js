const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isDevelopment = argv.mode === 'development';

  return {
    entry: {
      popup: './src/popup/index.tsx',
      options: './src/options/index.tsx',
      background: './src/background/background.ts',
      content: './src/content/content.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
            'postcss-loader',
          ],
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: '[name].css',
      }),
      new HtmlWebpackPlugin({
        template: './src/popup/popup.html',
        filename: 'popup.html',
        chunks: ['popup'],
      }),
      new HtmlWebpackPlugin({
        template: './src/options/options.html',
        filename: 'options.html',
        chunks: ['options'],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'manifest.json', to: 'manifest.json' },
          { 
            from: 'public/icons/icon16.png',
            to: 'icons/icon16.png'
          },
          { 
            from: 'public/icons/icon48.png',
            to: 'icons/icon48.png'
          },
          { 
            from: 'public/icons/formbot_icon.png',
            to: 'icons/icon128.png'
          },
          { 
            from: 'public/webhook-receiver.html',
            to: 'webhook-receiver.html'
          },
          { from: 'src/content/content.css', to: 'content.css' },
          { 
            from: 'node_modules/pdfjs-dist/build/pdf.worker.min.js', 
            to: 'pdf.worker.min.js' 
          },
        ],
      }),
    ],
    devtool: isDevelopment ? 'cheap-module-source-map' : false,
  };
};

