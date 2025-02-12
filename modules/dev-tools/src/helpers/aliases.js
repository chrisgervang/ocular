// Registers an alias for this module
import {resolve} from 'path';
import fs from 'fs';
import {getValidPath} from '../utils/utils.js';

export function getModuleInfo(path) {
  if (fs.lstatSync(path).isDirectory()) {
    try {
      const packageInfoText = fs.readFileSync(resolve(path, 'package.json'), 'utf-8');
      const packageInfo = JSON.parse(packageInfoText);
      return {
        name: packageInfo.name,
        path,
        packageInfo
      };
    } catch (err) {
      // ignore if sub directory does not contain package.json
    }
  }
  return null;
}

// Get information of all submodules
function getSubmodules(packageRoot) {
  const submodules = {};
  const parentPath = resolve(packageRoot, './modules');

  if (fs.existsSync(parentPath)) {
    // monorepo
    fs.readdirSync(parentPath).forEach((item) => {
      const itemPath = resolve(parentPath, item);
      const moduleInfo = getModuleInfo(itemPath);
      if (moduleInfo) {
        submodules[moduleInfo.name] = moduleInfo;
      }
    });
  } else {
    const moduleInfo = getModuleInfo(packageRoot);
    submodules[moduleInfo.name] = moduleInfo;
  }

  return submodules;
}

export default function getAliases(mode, packageRoot = process.env.PWD) {
  const aliases = {};
  const submodules = getSubmodules(packageRoot);

  for (const moduleName in submodules) {
    const {path} = submodules[moduleName];

    const testPath = resolve(path, 'test');
    if (fs.existsSync(testPath)) {
      aliases[`${moduleName}/test`] = testPath;
    }

    if (mode === 'dist') {
      aliases[moduleName] = getValidPath(
        resolve(path, 'dist/es5'),
        resolve(path, 'dist/esm'),
        resolve(path, 'dist')
      );
    } else {
      aliases[moduleName] = resolve(path, 'src');
    }
  }

  return aliases;
}
