import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const native = require('react-native-web');
const source = fs.readFileSync(new URL('../src/features/marketplace/elibrary/components/DigitalLibraryScreen.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function renderForm(progress, error = null) {
  const state = { formOpen: true, files: [], title: 'Apuntes de BD', description: 'Material académico',
    modality: 'DONACION', careerIds: [], subjectIds: [], progress, error };
  const mocks = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': native,
    'lucide-react-native': { BookOpen: () => null, FileText: () => null, Plus: () => null },
    '@/features/auth/hooks/useAuth': { useAuth: () => ({}) },
    '@/types/colors': { APP_COLORS: { PRIMARY: '#003459' } },
    '../hooks/useDigitalLibrary': { useDigitalLibrary: () => state },
  };
  for (const [name, exports] of Object.entries({
    '@/components/navigation/BottomNavigationBar': ['BottomNavigationBar'],
    './DigitalAcademicSelector': ['DigitalAcademicSelector'], './DigitalSearchForm': ['DigitalSearchForm'],
    './DigitalPreview': ['DigitalPreview'], './DigitalTradeCenter': ['DigitalRequestAction', 'DigitalTradeCenter'],
    './AcquiredDigitalResources': ['AcquiredDigitalResources'], './OwnedDigitalResources': ['OwnedDigitalResources'],
    './DigitalPublicationEditor': ['DigitalPublicationEditor'], './DigitalRecommendations': ['DigitalRecommendations'],
    '@/features/reports/components/ContentReportForm': ['ContentReportForm'],
  })) mocks[name] = Object.fromEntries(exports.map(key => [key, () => null]));
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: name => {
    assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
    return mocks[name];
  } });
  const messages = [];
  const originalError = console.error;
  console.error = (...args) => messages.push(args.join(' '));
  try {
    const html = renderToStaticMarkup(React.createElement(module.exports.default));
    assert.deepEqual(messages.filter(message => message.includes('Unexpected text node')), []);
    assert.ok(html.includes('Apuntes de BD'));
    return html;
  } finally { console.error = originalError; }
}

test('publication form renders empty upload progress without raw text in a View', () => {
  renderForm('');
});

test('upload progress and PDF rejection render while preserving the draft', () => {
  assert.ok(renderForm('Subiendo archivo 1 de 2').includes('Subiendo archivo 1 de 2'));
  assert.ok(renderForm('', 'El PDF está protegido').includes('El PDF está protegido'));
});
