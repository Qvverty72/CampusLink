import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, mocks, globals = {}) {
  const source = fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, ...globals, require: name => {
    assert.ok(Object.hasOwn(mocks, name), name); return mocks[name];
  } });
  return module.exports;
}

test('authenticated errors retain bounded machine codes, without trusting arbitrary server text', async () => {
  for (const code of ['ACCOUNT_SUSPENDED', 'ACCOUNT_DEACTIVATED', 'REGISTRATION_REQUIRED', '<script>', 123, 'A'.repeat(65)]) {
    const api = load('lib/api/authenticated-request.ts', {
      '@/features/auth/api/supabaseClient': { getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'qa-token' } } }) } }) },
    }, { Headers, process: { env: { EXPO_PUBLIC_API_URL: 'https://qa.invalid' } }, fetch: async () => new Response(JSON.stringify({ error: { code, message: '<untrusted>' } }), { status: 403 }) });
    await assert.rejects(api.authenticatedRequest('/api/v1/auth/me'), error => {
      assert.equal(error.status, 403);
      assert.equal(error.code, typeof code === 'string' && /^[A-Z_]{1,64}$/.test(code) ? code : undefined);
      assert.equal(error.message, 'La cuenta no tiene acceso.');
      return true;
    });
  }
});

function login(code, overrides = {}) {
  const auth = { status: 'forbidden', session: { user: { id: 'actor' } }, denialCode: code, error: null, refreshIdentity() {}, signOut() {}, ...overrides };
  const native = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'SafeAreaView', 'ScrollView', 'Text', 'TextInput'].map(name => [name, name]));
  const { LoginScreen } = load('features/auth/components/LoginScreen.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': { ...native, Platform: { OS: 'web' } },
    'expo-router': { Link: 'Link', Redirect: 'Redirect' }, './form.styles': { authStyles: {} },
    '../hooks/useLogin': { useLogin: () => ({ auth, busy: false, error: null }) },
  });
  const nodes = [], text = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node === 'string') { text.push(node); return; }
    if (!React.isValidElement(node)) return;
    nodes.push(node); visit(node.props.children);
  }
  visit(LoginScreen()); return { nodes, text: text.join(' ') };
}
test('login explains suspended/deactivated accounts and only offers registration for a missing profile', () => {
  for (const [code, message] of [['ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida.'], ['ACCOUNT_DEACTIVATED', 'Tu cuenta está desactivada.'], ['FORBIDDEN', 'Tu cuenta no tiene acceso.'], ['UNKNOWN', 'Tu cuenta no tiene acceso.'], ['REGISTRATION_REQUIRED', 'Falta completar tu registro institucional.']]) {
    const { nodes, text } = login(code);
    assert.ok(text.includes(message));
    assert.equal(nodes.some(node => node.type === 'Link' && node.props.href === '/register'), code === 'REGISTRATION_REQUIRED');
    assert.ok(text.includes('Cerrar sesión'));
    assert.equal(nodes.filter(node => node.props.accessibilityRole === 'alert').length, 1);
    assert.ok(nodes.some(node => node.type === 'Pressable' && typeof node.props.onPress === 'function'));
  }
  assert.ok(login('ACCOUNT_SUSPENDED', { error: 'No se pudo cerrar la sesión.' }).text.includes('No se pudo cerrar la sesión.'));
});
