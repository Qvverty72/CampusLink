// React/RNWeb y formularios/hooks reales; transportes controlados, sin cuentas ni correos reales.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const requireFrontend = createRequire(new URL('../package.json', import.meta.url));
const requireBackend = createRequire(new URL('../../backendclink/package.json', import.meta.url));
const { build } = requireBackend('esbuild');
const { chromium } = await import(process.env.CAMPUSLINK_PLAYWRIGHT_MODULE || 'playwright');
// Misma capa cssInterop nativa que envuelve controles con NativeWind; hosts RNWeb para medirlos.
const keyboardQA = process.argv.includes('--keyboard');
const remountScroll = process.argv.includes('--remount-scroll'); // Control negativo del defecto anterior.
const nativeInterop = keyboardQA || process.argv.includes('--native-interop');
const out = resolve(keyboardQA ? remountScroll ? 'dist/auth-keyboard-baseline-qa' : 'dist/auth-keyboard-qa' : nativeInterop ? 'dist/auth-forms-native-interop-qa' : 'dist/auth-forms-qa');
await mkdir(out, { recursive: true });
const mocks = {
  // Emite eventos controlados: la geometría real de UIKit/insets se comprueba después en iPhone.
  'qa-keyboard-native': `import React,{forwardRef,useEffect,useLayoutEffect,useImperativeHandle,useRef} from 'react';
    import * as Web from 'react-native-web'; export * from 'react-native-web';
    export const Platform={...Web.Platform,OS:'ios'};
    const q=globalThis.__keyboardQA={visible:false,dismissals:0,listeners:new Map(),resets:[],mounts:0,unmounts:0};
    q.emit=type=>{if(type==='keyboardDidShow')q.visible=true;if(type==='keyboardDidHide'){q.visible=false;Web.Keyboard.dismiss()}for(const cb of [...q.listeners.get(type)||[]])cb({endCoordinates:{height:q.visible?320:0}})};
    q.listenerCount=()=>[...q.listeners.values()].reduce((sum,set)=>sum+set.size,0);
    export const Keyboard={...Web.Keyboard,isVisible:()=>q.visible,dismiss:()=>{q.dismissals++;Web.Keyboard.dismiss()},
      addListener:(type,cb)=>{if(!q.listeners.has(type))q.listeners.set(type,new Set());q.listeners.get(type).add(cb);return {remove:()=>q.listeners.get(type).delete(cb)}}};
    export const ScrollView=forwardRef((props,ref)=>{const inner=useRef(null);
      useEffect(()=>{q.mounts++;return()=>q.unmounts++},[]);
      useLayoutEffect(()=>{q.props=props;q.scrollNode=inner.current?.getScrollableNode()});
      useImperativeHandle(ref,()=>({scrollTo:options=>{q.resets.push(options);inner.current?.scrollTo(options)}}),[]);
      return React.createElement(Web.ScrollView,{...props,ref:inner});});`,
  // La prueba mide estilos estáticos; ninguna animación nativa debe ejecutarse en este host web.
  'react-native-reanimated': `export default {createAnimatedComponent:Component=>Component};
    export const useAnimatedStyle=callback=>callback();
    export const Easing={linear:x=>x,ease:x=>x,bezier:()=>x=>x};`,
  'qa-native-controls': `import * as Web from 'react-native-web';
    import {cssInterop} from 'react-native-css-interop/dist/runtime/native/api';
    export * from 'react-native-web';
    export const Pressable=cssInterop(Web.Pressable,{className:'style'});
    export const TouchableOpacity=cssInterop(Web.TouchableOpacity,{className:'style'});
    ${keyboardQA ? "export {Keyboard,Platform,ScrollView} from 'qa-keyboard-native';" : ''}`,
  'expo-router': `import React, {useEffect} from 'react';
    const focus=globalThis.__focusQA={active:true,entries:new Set(),
      blur(){this.active=false;for(const entry of this.entries){entry.cleanup?.();entry.cleanup=undefined}},
      focus(){this.active=true;for(const entry of this.entries)entry.cleanup=entry.callback()}};
    export const useFocusEffect=callback=>useEffect(()=>{const entry={callback,cleanup:focus.active?callback():undefined};focus.entries.add(entry);return()=>{focus.entries.delete(entry);entry.cleanup?.()}},[callback]);
    export function Link({href,asChild,children}) { return asChild ? React.cloneElement(children,{onPress:()=>globalThis.__qa.navigate(href)}) : React.createElement('a',{href,onClick:e=>{e.preventDefault();globalThis.__qa.navigate(href)}},children); }
    export function Redirect({href}) {useEffect(()=>globalThis.__qa.navigate(href),[href]);return null;}`,
  'react-native-safe-area-context': `export const useSafeAreaInsets=()=>({top:${keyboardQA ? 59 : 0},bottom:${keyboardQA ? 34 : 0},left:0,right:0});`,
  './useAuth': `export const useAuth=()=>globalThis.__qa.auth;`,
  '../api/sessionApi': `
    export async function loginAccount(email,password){const q=globalThis.__qa;q.calls.push({type:'login',email,password});if(q.failLogin)throw new Error('Revisa tus credenciales.');q.auth.status='ready';q.navigate('/login');}
    export async function requestRecovery(email){const q=globalThis.__qa;q.calls.push({type:'recovery',email,at:Date.now()});if(q.failRecovery)throw new Error('No se pudo conectar.');if(q.holdRecovery)await new Promise(resolve=>q.releaseRecovery=resolve);}
    export async function resetPassword(email,code,password){const q=globalThis.__qa;q.calls.push({type:'reset',email,code,password});if(q.failReset)throw new Error('Código inválido o vencido.');}`,
  '../api/registrationApi': `
    export async function getRegistrationOptions(){return [{dominio:'duocuc.cl',institucion_nombre:'DuocUC',institucion_id:'duoc',campus_id:'san-andres',campus_nombre:'San Andrés'},{dominio:'duocuc.cl',institucion_nombre:'DuocUC',institucion_id:'duoc',campus_id:'alameda',campus_nombre:'Alameda'}];}
    export async function registerInstitutionalAccount(input){globalThis.__qa.calls.push({type:'register',...input});}
    export async function confirmInstitutionalEmail(email,code){const q=globalThis.__qa;q.calls.push({type:'verify',email,code});if(q.failVerify)throw new Error('Código inválido o vencido.');return q.registrationResult||'complete';}
    export async function resendInstitutionalConfirmation(email){const q=globalThis.__qa;q.calls.push({type:'resend',email});if(q.failResend)throw new Error('No se pudo reenviar el código.');}
    export async function completeInstitutionalRegistration(){globalThis.__qa.calls.push({type:'complete'});}`,
};
const bundle = await build({
  absWorkingDir: process.cwd(), tsconfigRaw: { compilerOptions: {} },
  stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {LoginScreen} from './src/features/auth/components/LoginScreen';
    import {RegisterScreen} from './src/features/auth/components/RegisterScreen';
    import {RecoveryScreen} from './src/features/auth/components/RecoveryScreen';
    const q=globalThis.__qa={calls:[],auth:{status:'signedOut',session:null,error:null,identity:{campusId:'san-andres',profile:{nombre_completo:'Camila Soto'}}}};
    function App(){const [route,setRoute]=useState('/login');const [revision,setRevision]=useState(0);
      q.navigate=path=>{setRoute(path);setRevision(n=>n+1)};
      q.rerender=()=>setRevision(n=>n+1);
      q.auth.refreshIdentity=()=>{if(q.registrationResult!=='profile_pending'||q.completeReady)q.auth.status='ready';setRevision(n=>n+1)};
      q.auth.signOut=async()=>{q.auth.status='signedOut';q.auth.session=null;setRevision(n=>n+1)};
      return route==='/register'?React.createElement(RegisterScreen):route==='/recover'?React.createElement(RecoveryScreen):route==='/profile'?React.createElement('div',null,'Perfil de prueba'):React.createElement(LoginScreen);}
    createRoot(document.getElementById('root')).render(React.createElement(App));`, resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false', global: 'globalThis' },
  plugins: [{ name: 'auth-fixtures', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      if (nativeInterop && args.path === 'react-native' && args.importer.endsWith('AuthUI.tsx')) {
        return { path: 'qa-native-controls', namespace: 'fixture' };
      }
      if (keyboardQA && args.path === 'react-native' && ['useAuthFormScroll.ts','useLogin.ts','useRegistration.ts','useRecovery.ts','safeArea.ts'].some(file=>args.importer.endsWith(file))) {
        return { path: 'qa-keyboard-native', namespace: 'fixture' };
      }
      if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'fixture' };
      let name = args.path;
      if (name === 'react-native') name = 'react-native-web';
      if (name === 'react-native-svg') name = 'react-native-svg/lib/commonjs/elements.web.js';
      if (name.startsWith('@/')) name = resolve('src', name.slice(2));
      if (name.startsWith('.') || name.startsWith('C:')) {
        const base = name.startsWith('.') ? resolve(args.resolveDir, name) : name;
        const source = ['.tsx', '.ts', '.js'].map(ext => base + ext).find(existsSync);
        if (source) return { path: source, namespace: 'source' };
      }
      return { path: (args.importer && args.namespace !== 'fixture' && args.importer !== '<stdin>' ? createRequire(args.importer) : requireFrontend).resolve(name), namespace: 'source' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'jsx' }));
    builder.onLoad({ filter: /.*/, namespace: 'source' }, async args => ({
      contents: (await readFile(args.path, 'utf8')).replace(remountScroll && args.path.endsWith('AuthUI.tsx') ? '<ScrollView ref={scroll}' : '__no_baseline_replacement__', '<ScrollView key={stepKey} ref={scroll}'),
      resolveDir: dirname(args.path), loader: args.path.endsWith('.tsx') ? 'tsx' : args.path.endsWith('.ts') ? 'ts' : 'jsx',
    }));
  } }],
});
const browser = await chromium.launch({ channel: process.env.CAMPUSLINK_QA_BROWSER || 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.setDefaultTimeout(10_000);
  await page.route('**/*', route => route.abort());
  await page.clock.install({ time: new Date('2026-10-27T15:00:00Z') });
  await page.setContent('<html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;height:100%;}#root{display:flex;flex-direction:column;}</style><div id="root"></div></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const button = name => page.getByRole('button', { name, exact: true });
  const field = label => page.getByLabel(label, { exact: true });
  const navigate = route => page.evaluate(route => globalThis.__qa.navigate(route), route);
  const calls = type => page.evaluate(type => globalThis.__qa.calls.filter(call => call.type === type), type);
  async function ready(text) {
    await page.getByRole('heading', { name: text, exact: true }).waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  async function screenshot(name, width = 390) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow');
    await page.screenshot({ path: resolve(out, name + '.png'), fullPage: true });
  }
  async function bottomScreenshot(name) {
    const otherEmail = button('Usar otro correo');
    await otherEmail.scrollIntoViewIfNeeded();
    assert.ok(await otherEmail.isVisible());
    const box = await otherEmail.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 1000, 'Secondary action scrolls into viewport');
    await page.screenshot({ path: resolve(out, name + '.png'), fullPage: true });
  }
  async function toggle(label, visible) {
    const input = field(label); const value = await input.inputValue();
    await button(`${visible ? 'Mostrar' : 'Ocultar'} ${label.toLowerCase()}`).click();
    assert.equal(await input.evaluate(node => node.type), visible ? 'text' : 'password');
    assert.equal(await input.inputValue(), value, 'Eye preserves input');
  }
  async function cooldown() {
    assert.equal(await button(/^Reenviar código en \d+ s$/).getAttribute('aria-disabled'), 'true');
  }
  async function keyboardCycles(labels, name) {
    if (!keyboardQA) return;
    const snapshot = await page.evaluate(() => ({mounts:__keyboardQA.mounts,unmounts:__keyboardQA.unmounts}));
    const values = await Promise.all(labels.map(label=>field(label).inputValue()));
    const height = (await page.viewportSize()).height;
    const brandTop = () => page.getByText('CampusLink',{exact:true}).evaluate(node=>node.getBoundingClientRect().top-__keyboardQA.scrollNode.getBoundingClientRect().top+__keyboardQA.scrollNode.scrollTop);
    const beforeTop = await brandTop();
    for (let cycle=0;cycle<8;cycle++) {
      await field(labels[cycle%labels.length]).focus();
      await page.evaluate(()=>__keyboardQA.emit('keyboardDidShow'));
      await page.setViewportSize({width:390,height:560});
      await field(labels.at(-1)).scrollIntoViewIfNeeded();
      assert.ok(Math.abs(await brandTop()-beforeTop)<2,'Native content anchor does not recenter as usable height changes');
      await page.evaluate(()=>{__keyboardQA.emit('keyboardWillChangeFrame');__qa.rerender()});
      await page.evaluate(()=>__keyboardQA.emit('keyboardDidHide'));
      await page.setViewportSize({width:390,height});
      assert.deepEqual(await Promise.all(labels.map(label=>field(label).inputValue())),values,'Repeated keyboard cycles preserve draft');
    }
    assert.deepEqual(await page.evaluate(()=>({mounts:__keyboardQA.mounts,unmounts:__keyboardQA.unmounts})),snapshot,'Keyboard/focus/rerenders keep scroll host alive');
    assert.equal(await page.evaluate(()=>__keyboardQA.listenerCount()),0,'No accumulated keyboard subscriptions');
    await screenshot(name);
  }
  async function beginKeyboardTransition() {
    if (!keyboardQA) return null;
    return page.evaluate(()=>{__keyboardQA.emit('keyboardDidShow');return {mounts:__keyboardQA.mounts,resets:__keyboardQA.resets.length,dismissals:__keyboardQA.dismissals}});
  }
  async function finishKeyboardTransition(before) {
    if (!keyboardQA) return;
    assert.equal(await page.evaluate(()=>__keyboardQA.mounts),before.mounts,'Changing step never remounts keyboard-adjusted ScrollView');
    assert.equal(await page.evaluate(()=>__keyboardQA.resets.length),before.resets,'No forced scroll during keyboard animation');
    assert.ok(await page.evaluate(()=>__keyboardQA.dismissals)>before.dismissals,'Submitting and changing step dismiss keyboard');
    assert.equal(await page.evaluate(()=>__keyboardQA.listenerCount()),1,'One pending reset while keyboard closes');
    await page.evaluate(()=>__keyboardQA.emit('keyboardDidHide'));
    assert.equal(await page.evaluate(()=>__keyboardQA.resets.length),before.resets+1,'One reset after keyboard has restored insets');
    assert.equal(await page.evaluate(()=>__keyboardQA.scrollNode.scrollTop),0);
    assert.equal(await page.evaluate(()=>__keyboardQA.listenerCount()),0,'Reset listener cleans itself');
    await page.evaluate(()=>__keyboardQA.emit('keyboardDidHide'));
    assert.equal(await page.evaluate(()=>__keyboardQA.resets.length),before.resets+1,'Late repeated hide events do not jump the form');
  }

  await ready('Iniciar sesión');
  if (keyboardQA) assert.equal(await page.evaluate(()=>__keyboardQA.props.automaticallyAdjustKeyboardInsets),true);
  assert.equal(await button('Iniciar sesión').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(0, 46, 86)', 'Primary button must keep its blue background through interop');
  await screenshot('login-390'); await screenshot('login-320', 320); await screenshot('login-desktop', 1280);
  await page.setViewportSize({ width: 390, height: 1000 });
  await field('Correo').fill('camila@duocuc.cl'); await field('Contraseña').fill('Clave-de-prueba');
  await keyboardCycles(['Correo','Contraseña'],'keyboard-login-390');
  await toggle('Contraseña', true); await toggle('Contraseña', false);
  await page.evaluate(() => globalThis.__qa.failLogin = true);
  await button('Iniciar sesión').click(); await page.getByRole('alert').waitFor();
  assert.equal(await field('Contraseña').inputValue(), ''); assert.equal((await calls('login')).length, 1);
  await screenshot('login-error-390');
  await page.getByRole('link', { name: 'Olvidé mi contraseña' }).click(); await ready('¿Olvidaste tu contraseña?');
  await screenshot('recovery-email-390');
  await field('Correo').fill(''); await button('Enviar código').click();
  assert.equal((await calls('recovery')).length, 0);
  await field('Correo').fill(' camila@duocuc.cl ');
  await page.evaluate(() => globalThis.__qa.holdRecovery = true);
  const recoveryTransition = await beginKeyboardTransition();
  await button('Enviar código').click();
  await page.waitForFunction(() => globalThis.__qa.releaseRecovery);
  assert.equal(await button(/^Enviar código en \d+ s$/).getAttribute('aria-disabled'), 'true');
  await page.evaluate(() => globalThis.__qa.releaseRecovery()); await ready('Recuperar contraseña');
  await finishKeyboardTransition(recoveryTransition);
  await cooldown(); assert.equal((await calls('recovery')).length, 1);
  await field('Nueva contraseña').fill('Clave-nueva'); await field('Repetir nueva contraseña').fill('Otra-clave');
  await keyboardCycles(['Nueva contraseña','Repetir nueva contraseña'],'keyboard-recovery-390');
  await toggle('Nueva contraseña', true); assert.equal(await field('Repetir nueva contraseña').getAttribute('type'), 'password');
  await toggle('Repetir nueva contraseña', true); await toggle('Nueva contraseña', false); await toggle('Repetir nueva contraseña', false);
  await field('Código de recuperación').fill('123456'); await button('Cambiar contraseña').click();
  assert.equal((await calls('reset')).length, 0);
  await screenshot('recovery-code-390'); await screenshot('recovery-code-320', 320);
  await bottomScreenshot('recovery-bottom-320');
  await button('Usar otro correo').click(); await ready('¿Olvidaste tu contraseña?');
  assert.equal(await button(/^Enviar código en \d+ s$/).getAttribute('aria-disabled'), 'true');
  await navigate('/login'); await navigate('/recover'); await ready('¿Olvidaste tu contraseña?');
  await field('Correo').fill('camila@duocuc.cl');
  assert.equal(await button(/^Enviar código en \d+ s$/).getAttribute('aria-disabled'), 'true', 'Cooldown survives route remount');
  const recoveryElapsed = await page.evaluate(()=>Date.now()-__qa.calls.find(call=>call.type==='recovery').at);
  await page.clock.fastForward(Math.max(0,29_000-recoveryElapsed)); assert.equal(await button('Enviar código en 1 s').getAttribute('aria-disabled'), 'true');
  await page.clock.fastForward(1000);
  await page.evaluate(() => { globalThis.__qa.holdRecovery = false; });
  await button('Enviar código').click(); await ready('Recuperar contraseña'); await cooldown();
  await page.clock.fastForward(30_000);
  await button('Reenviar código').click(); await cooldown();
  assert.equal((await calls('recovery')).length, 3);
  await field('Código de recuperación').fill('123456'); await field('Nueva contraseña').fill('Clave-nueva'); await field('Repetir nueva contraseña').fill('Clave-nueva');
  await page.evaluate(() => globalThis.__qa.failReset = true);
  await button('Cambiar contraseña').click(); await page.getByRole('alert').waitFor();
  await page.evaluate(() => globalThis.__qa.failReset = false);
  await button('Cambiar contraseña').click(); await ready('Contraseña actualizada'); await screenshot('recovery-success-390');
  await page.getByRole('link', { name: 'Iniciar sesión', exact: true }).click(); await ready('Iniciar sesión');

  await page.getByRole('link', { name: 'Crear cuenta institucional' }).click(); await ready('Crea tu cuenta');
  await screenshot('register-empty-390');
  await field('Nombre completo').fill('Camila Soto');
  for (const email of ['@duocuc.cl', 'camila@example.com', 'camila@duocuc.cl.evil']) {
    await field('Correo institucional').fill(email); assert.equal(await page.getByRole('button', { name: /^Campus:/ }).count(), 0);
  }
  await field('Correo institucional').fill('camila@duocuc.cl'); await field('Contraseña').fill('Clave-registro');
  await toggle('Contraseña', true); await toggle('Contraseña', false);
  await button('Campus: Selecciona tu campus').click(); await screenshot('register-campus-390');
  await page.getByRole('radio', { name: 'San Andrés', exact: true }).click();
  await ready('Crea tu cuenta');
  await field('Contraseña').press('Enter');
  await ready('Crea tu cuenta');
  assert.equal((await calls('register')).length, 0, 'Filling all fields, choosing campus and finishing keyboard editing must not submit');
  assert.equal(await button('Crear cuenta').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(0, 46, 86)', 'Create account stays visible after selecting campus');
  await keyboardCycles(['Nombre completo','Correo institucional','Contraseña'],'keyboard-register-390');
  await screenshot('register-390'); await screenshot('register-320', 320);
  const registerTransition = await beginKeyboardTransition();
  await button('Crear cuenta').click(); await ready('Verifica tu correo'); await cooldown();
  await finishKeyboardTransition(registerTransition);
  assert.equal((await calls('register'))[0].campusId, 'san-andres');
  await screenshot('register-verify-390');
  await bottomScreenshot('register-verify-bottom-390');
  await button('Usar otro correo').click(); await ready('Crea tu cuenta');
  assert.equal(await field('Contraseña').inputValue(), '');
  await navigate('/login'); await navigate('/register'); await ready('Crea tu cuenta');
  await field('Nombre completo').fill('Camila Soto');
  await field('Correo institucional').fill('camila@duocuc.cl');
  await field('Contraseña').fill('Clave-registro');
  await button('Campus: Selecciona tu campus').click();
  await page.getByRole('radio', { name: 'San Andrés', exact: true }).click();
  assert.equal(await button(/^Crear cuenta en \d+ s$/).getAttribute('aria-disabled'), 'true', 'Registration cooldown survives remount');
  await page.clock.fastForward(30_000);
  await button('Crear cuenta').click(); await ready('Verifica tu correo'); await cooldown();
  await page.clock.fastForward(30_000);
  await page.evaluate(() => globalThis.__qa.failResend = true);
  await button('Reenviar código').click(); await page.getByRole('alert').waitFor(); await cooldown();
  assert.equal((await calls('resend')).length, 1, 'Failed attempts are also cooled down');
  await page.clock.fastForward(30_000); await page.evaluate(() => globalThis.__qa.failResend = false);
  await button('Reenviar código').click(); await cooldown();
  await field('Código de verificación').fill('123456');
  await page.evaluate(() => globalThis.__qa.failVerify = true);
  await button('Verificar correo').click(); await page.getByRole('alert').waitFor();
  await page.evaluate(() => { globalThis.__qa.failVerify = false; globalThis.__qa.registrationResult = 'profile_pending'; });
  await button('Verificar correo').click(); await ready('Correo confirmado');
  await page.evaluate(() => globalThis.__qa.completeReady = true);
  await button('Completar cuenta').click(); await ready('Cuenta verificada'); await screenshot('register-success-390');

  await page.evaluate(() => { globalThis.__qa.auth.status = 'signedOut'; globalThis.__qa.failLogin = false; });
  await navigate('/login'); await ready('Iniciar sesión');
  await field('Correo').fill('camila@duocuc.cl'); await field('Contraseña').fill('Clave-nueva'); await button('Iniciar sesión').click();
  await page.getByText('Perfil de prueba').waitFor();
  if (keyboardQA) {
    // Volver a otro correo y navegar fuera antes de terminar la animación cancela resets viejos.
    await page.evaluate(()=>__qa.auth.status='signedOut');
    await navigate('/recover'); await ready('¿Olvidaste tu contraseña?');
    await field('Correo').fill('cleanup@duocuc.cl');
    const cancelledTransition = await beginKeyboardTransition();
    await button('Enviar código').click(); await ready('Recuperar contraseña');
    assert.equal(await page.evaluate(()=>__keyboardQA.listenerCount()),1);
    await page.evaluate(()=>__focusQA.blur());
    const backgroundDismissals=await page.evaluate(()=>__keyboardQA.dismissals);
    assert.equal(await page.evaluate(()=>__keyboardQA.listenerCount()),0,'Blur cancels keyboard animation reset without unmounting screen');
    await button('Usar otro correo').click(); await ready('¿Olvidaste tu contraseña?');
    assert.equal(await page.evaluate(()=>__keyboardQA.listenerCount()),0,'Background step changes cannot subscribe to the next screen keyboard');
    assert.equal(await page.evaluate(()=>__keyboardQA.dismissals),backgroundDismissals,'Background effects cannot dismiss another screen keyboard');
    await page.evaluate(()=>__focusQA.focus());
    assert.equal(await page.evaluate(()=>__keyboardQA.listenerCount()),1,'Refocusing handles only the latest step');
    await navigate('/login'); await ready('Iniciar sesión');
    await page.evaluate(()=>__keyboardQA.emit('keyboardDidHide'));
    assert.equal(await page.evaluate(()=>__keyboardQA.resets.length),cancelledTransition.resets,'A hidden screen cannot reset scroll after a late hide');
    assert.equal(await page.evaluate(()=>__keyboardQA.listenerCount()),0,'Navigation leaves no keyboard listener');
    console.log('iOS configuration on RNWeb: 24 keyboard/viewport cycles, stable scroll/drafts, delayed step reset, repeated hide events, navigation cleanup passed; UIKit keyboard remains physical QA.');
  }
  assert.deepEqual(errors, []);
  console.log(`${nativeInterop ? 'Native cssInterop on RNWeb' : 'RNWeb'}: visible primary buttons; no registration before explicit activation; login/recovery/registration, four eyes, campus, OTP, cooldown/remount and profile completion passed. 16 responsive screenshots. No real HTTP/email.`);
} finally { await browser.close(); }
