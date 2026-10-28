import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url), root = fileURLToPath(new URL('../../', import.meta.url));

/** Carga composiciones reales del módulo; sustituye transporte/plataforma, no los resultados. */
export function analyticsRenderer(overrides = {}, actions = [], fields = []) {
  const native = require('react-native-web'), cache = new Map();
  const icons = new Proxy({}, { get: () => () => null });
  const svg = new Proxy({ __esModule: true, default: props => React.createElement('svg', props) }, {
    get: (target, name) => name in target ? target[name] : props => React.createElement(({ Circle: 'circle', Line: 'line', Polyline: 'polyline', Rect: 'rect', Text: 'text', Path: 'path', Polygon: 'polygon', Defs: 'defs', LinearGradient: 'linearGradient', Stop: 'stop' })[name] ?? 'g', props),
  });
  const dependencies = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { ...native,
      Pressable: props => { actions.push(props); return React.createElement(native.Pressable, props); },
      TouchableOpacity: props => { actions.push(props); return React.createElement(native.TouchableOpacity, props); },
      TextInput: props => { fields.push(props); return React.createElement(native.TextInput, props); },
      Modal: ({ children }) => React.createElement(native.View, null, children),
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) },
    'lucide-react-native': icons, 'react-native-svg': svg,
    'expo-router': { Link: ({ asChild, children, href, ...props }) => {
      if (asChild) {
        assert.ok(!Array.isArray(children.props.style), 'Expo Router Slot rejects style arrays on its direct child');
        return React.cloneElement(children, { href });
      }
      return React.createElement(native.Text, props, children);
    } },
    '@/components/navigation/BottomNavigationBar': { BottomNavigationBar: () => null },
    '@/features/analytics/hooks/useReportExport': { useReportExport: () => ({ allowed: true, exporting: null, error: '', exportFile() {} }) },
    ...overrides,
  };
  function load(file) {
    const absolute = path.resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute);
    const source = fs.readFileSync(absolute, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} }; cache.set(absolute, module.exports);
    vm.runInNewContext(compiled, { module, exports: module.exports, AbortController, URLSearchParams,
      require: name => {
        if (name === '../hooks/useReportExport') return dependencies['@/features/analytics/hooks/useReportExport'];
        if (Object.hasOwn(dependencies, name)) return dependencies[name];
        const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(absolute), name) : null;
        assert.ok(base, `Unexpected dependency ${name}`);
        const resolved = ['.web.tsx', '.tsx', '.ts', '.js'].map(ext => base + ext).find(fs.existsSync);
        assert.ok(resolved, `Missing module ${name}`); return load(resolved);
      },
    });
    return module.exports;
  }
  return { load, render(file, exportName = 'default', props = {}) {
    return renderToStaticMarkup(React.createElement(load(file)[exportName], props));
  } };
}
