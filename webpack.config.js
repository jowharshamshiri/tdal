import path from "path";
import { fileURLToPath } from "url";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import { CleanWebpackPlugin } from "clean-webpack-plugin";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    // Set the mode explicitly based on environment
    mode: isProduction ? "production" : "development",

    // Entry point of application
    entry: "./src/index.tsx", // Adjust if your entry file is different

    // Configure output
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: isProduction ? "js/[name].[contenthash].js" : "js/[name].js",
      publicPath: "/",
    },

    // Enable source maps for debugging
    devtool: isProduction ? "source-map" : "eval-cheap-module-source-map",

    // Configure module resolution
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },

    // Configure loaders for different file types
    module: {
      rules: [
        // TypeScript/JavaScript
        {
          test: /\.(ts|tsx|js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              presets: [
                "@babel/preset-env",
                "@babel/preset-react",
                "@babel/preset-typescript",
              ],
              plugins: [
                "@babel/plugin-transform-runtime",
                [
                  "@babel/plugin-transform-react-jsx",
                  {
                    runtime: "automatic",
                  },
                ],
              ],
              // In development mode, don't minify the code
              compact: isProduction,
            },
          },
        },
        // CSS/SCSS
        {
          test: /\.(css|scss|sass)$/,
          use: [
            isProduction ? MiniCssExtractPlugin.loader : "style-loader",
            {
              loader: "css-loader",
              options: {
                sourceMap: !isProduction,
                importLoaders: 1,
              },
            },
            "postcss-loader",
            "sass-loader",
          ],
        },
        // Images
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: "asset/resource",
          generator: {
            filename: "images/[name][ext]",
          },
        },
        // Fonts
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/i,
          type: "asset/resource",
          generator: {
            filename: "fonts/[name][ext]",
          },
        },
      ],
    },

    // Configure plugins
    plugins: [
      // Clean the dist folder before building
      new CleanWebpackPlugin(),

      // Generate HTML file
      new HtmlWebpackPlugin({
        template: "./public/index.html", // Adjust to your HTML template path
        favicon: "./public/favicon.ico", // Adjust to your favicon path or remove
        inject: true,
        minify: isProduction
          ? {
              removeComments: true,
              collapseWhitespace: true,
              removeRedundantAttributes: true,
              useShortDoctype: true,
              removeEmptyAttributes: true,
              removeStyleLinkTypeAttributes: true,
              keepClosingSlash: true,
              minifyJS: true,
              minifyCSS: true,
              minifyURLs: true,
            }
          : false,
      }),

      // Extract CSS to separate files in production
      ...(isProduction
        ? [
            new MiniCssExtractPlugin({
              filename: "css/[name].[contenthash].css",
            }),
          ]
        : []),
    ],

    // Development server configuration
    devServer: {
      static: {
        directory: path.join(__dirname, "public"),
      },
      port: 3000,
      hot: true,
      open: true,
      historyApiFallback: true,
      compress: true,
      client: {
        overlay: {
          errors: true,
          warnings: false,
        },
      },
    },

    // Optimization settings
    optimization: {
      // In development, we don't want to minimize
      minimize: isProduction,

      // Split chunks to optimize loading
      splitChunks: {
        chunks: "all",
        name: false,
      },

      // Generate a runtime chunk
      runtimeChunk: {
        name: "runtime",
      },
    },

    // Performance hints - disable in development for faster rebuilds
    performance: {
      hints: isProduction ? "warning" : false,
    },

    // Stats configuration - control what gets logged during build
    stats: {
      colors: true,
      errorDetails: true,
    },
  };
};
