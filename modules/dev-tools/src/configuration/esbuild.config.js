// / For bundles published to npm
import fs from 'fs';
import {join} from 'path';
import util from 'util';
import {getOcularConfig} from '../helpers/get-ocular-config.js';
import babel from 'esbuild-plugin-babel';
import ext from 'esbuild-plugin-external-global';

/**
 * Get list of dependencies to exclude using esbuild-plugin-external-global
 * @param externalPackages string[]
 */
// function getExternalGlobalsAMD(externalPackages) {
//   const externals = {};
//   for (const packageName of externalPackages) {
//     externals[packageName] = `typeof require === 'function' ? require('${packageName}') : null`;
//   }
//   return externals;
// }

/**
 * Get list of dependencies to exclude using esbuild-plugin-external-global
 * @param externalPackages string[]
 * @param mapping {[pattern: string]: replacement}
 */
function getExternalGlobalsIIFE(externalPackages, mapping) {
  const externals = {};
  for (const packageName of externalPackages) {
    for (const key in mapping) {
      if (packageName.search(key) === 0) {
        externals[packageName] = mapping[key];
        break;
      }
    }
  }
  return externals;
}

/** Evaluate root babel config */
async function getBabelConfig(configPath, env, target) {
  let config = await import(configPath);
  if (config.default) {
    config = config.default;
  }
  if (typeof config === 'function') {
    config = config({
      env: () => env
    });
  }
  const envPreset = config.presets.find((item) => item[0] === '@babel/env');
  if (target && envPreset) {
    envPreset[1] = envPreset[1] || {};
    envPreset[1].targets = target;
  }
  return config;
}

// esbuild does not support umd format
// Work around from https://github.com/evanw/esbuild/issues/819
// Template: https://webpack.js.org/configuration/output/#type-umd
function umdWrapper(libName) {
  return {
    format: 'iife',
    globalName: '__exports__',
    banner: {
      js: `\
(function webpackUniversalModuleDefinition(root, factory) {
  if (typeof exports === 'object' && typeof module === 'object')
    module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
        ${
          libName
            ? `else if (typeof exports === 'object') exports['${libName}'] = factory();
  else root['${libName}'] = factory();`
            : `else {
  var a = factory();
  for (var i in a) (typeof exports === 'object' ? exports : root)[i] = a[i];
}`
        }})(globalThis, function () {`
    },
    footer: {
      js: `\
      return __exports__;
      });`
    }
  };
}

/* eslint-disable max-statements,complexity */
export default async function getBundleConfig(opts) {
  // This script must be executed in a submodule's directory
  const packageRoot = process.cwd();
  const packageInfo = JSON.parse(fs.readFileSync(join(packageRoot, 'package.json'), 'utf-8'));
  const ocularConfig = await getOcularConfig({
    root: join(packageRoot, '../..')
  });

  opts = {...ocularConfig.bundle, ...opts};
  const devMode = opts.env === 'dev';

  const {
    input,
    output = devMode ? './dist/dist.dev.js' : './dist.min.js',
    format = 'iife',
    target,
    externals,
    globalName,
    debug,
    sourcemap = false
  } = opts;

  const babelConfig = devMode
    ? {
        filter: /src|bundle/,
        config: await getBabelConfig(ocularConfig.babel.configPath, 'bundle-dev', target)
      }
    : {
        filter: /src|bundle|esm/,
        config: await getBabelConfig(ocularConfig.babel.configPath, 'bundle', target)
      };

  let externalPackages = Object.keys(packageInfo.peerDependencies || {});
  if (typeof externals === 'string') {
    externalPackages = externalPackages.concat(externals.split(','));
  } else if (Array.isArray(externals)) {
    externalPackages = externalPackages.concat(externals);
  }

  const config = {
    entryPoints: [input],
    outfile: output,
    bundle: true,
    format,
    minify: !devMode,
    alias: ocularConfig.aliases,
    platform: 'browser',
    target: ['esnext'],
    logLevel: 'info',
    sourcemap,
    plugins: [babel(babelConfig)]
  };
  if (globalName) {
    config.globalName = globalName;
  }

  let externalGlobals;
  switch (format) {
    case 'cjs':
    case 'esm':
      // Use esbuild's built-in external functionality
      config.packages = 'external';
      if (externals) {
        config.external = externals;
      }
      break;

    case 'umd':
      Object.assign(config, umdWrapper(globalName));
      externalGlobals = getExternalGlobalsIIFE(externalPackages, ocularConfig.bundle.globals);
      break;

    case 'iife':
      externalGlobals = getExternalGlobalsIIFE(externalPackages, ocularConfig.bundle.globals);
      break;

    default:
      break;
  }
  if (externalGlobals) {
    config.plugins.unshift(ext.externalGlobalPlugin(externalGlobals));
  }

  if (debug) {
    const printableConfig = {
      ...config,
      plugins: config.plugins.map((item) => {
        return {
          name: item.name,
          options: item.name === 'babel' ? babelConfig : externalGlobals
        };
      })
    };

    console.log(util.inspect(printableConfig, {showHidden: false, depth: null, colors: true}));
  }

  return config;
}
