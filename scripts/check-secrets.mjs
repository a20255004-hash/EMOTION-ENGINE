#!/usr/bin/env node
/**
 * Verifica que ninguna credencial llega al navegador:
 * 1. Busca patrones de claves y los valores reales de .env en la build (dist/).
 * 2. Arranca el servidor con una clave falsa y comprueba que ni /api/capabilities
 *    ni las respuestas de error la revelan.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const FAKE = 'sk-ant-FAKE-SECRET-0123456789abcdef';
const PORT = 8799;
let failures = 0;
const fail = (m) => {
  failures++;
  console.error(`✗ ${m}`);
};
const ok = (m) => console.log(`✓ ${m}`);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync('dist')) {
  console.error('No existe dist/. Ejecuta `npm run build` primero.');
  process.exit(1);
}
const envValues = existsSync('.env')
  ? readFileSync('.env', 'utf8')
      .split('\n')
      .map((l) => l.match(/^\s*([A-Z0-9_]*(KEY|TOKEN|SECRET)[A-Z0-9_]*)\s*=\s*(.+)\s*$/))
      .filter(Boolean)
      .map((m) => m[3].replace(/^['"]|['"]$/g, ''))
      .filter((v) => v.length >= 8)
  : [];
const patterns = [/sk-ant-[A-Za-z0-9_-]{8,}/, /sk-[A-Za-z0-9]{32,}/, /AIza[0-9A-Za-z_-]{30,}/, /ANTHROPIC_API_KEY|OPENAI_COMPAT_API_KEY|MUSIC_API_KEY/];
const files = walk('dist').filter((f) => /\.(js|html|css|json|map)$/.test(f));
let clean = true;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const re of patterns) if (re.test(text)) (clean = false), fail(`${f} contiene un patrón sospechoso ${re}`);
  for (const v of envValues) if (text.includes(v)) (clean = false), fail(`${f} contiene el valor de una variable secreta de .env`);
}
if (clean) ok(`build limpia (${files.length} archivos revisados, ${envValues.length} valores de .env comprobados)`);

const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/index.ts'], {
  env: { ...process.env, API_PORT: String(PORT), AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: FAKE, AI_TIMEOUT_MS: '8000', MUSIC_PROVIDER: 'http', MUSIC_API_URL: 'https://127.0.0.1:1/never', MUSIC_API_KEY: FAKE },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', (d) => (logs += d));
server.stderr.on('data', (d) => (logs += d));

const base = `http://localhost:${PORT}`;
for (let i = 0; i < 50; i++) {
  try {
    await fetch(`${base}/api/health`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
  }
}
try {
  const caps = await (await fetch(`${base}/api/capabilities`)).text();
  if (caps.includes(FAKE) || /sk-ant/.test(caps)) fail('/api/capabilities revela la clave');
  else ok('/api/capabilities no revela credenciales');
  const capsJson = JSON.parse(caps);
  if (capsJson.ai.available !== true) fail('con clave configurada la IA debería figurar como disponible');

  const r = await fetch(`${base}/api/ai/interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction: 'más lento', state: { world: 'ocean', params: { speed: 1 }, bindings: [] } }),
  });
  const body = await r.text();
  if (r.ok) fail('una clave falsa no debería producir una respuesta correcta');
  else if (body.includes(FAKE)) fail('el error de IA revela la clave');
  else ok(`error de IA controlado sin revelar la clave (${r.status} ${JSON.parse(body).error.code})`);

  const bad = await fetch(`${base}/api/ai/interpret`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction: '' }) });
  if (bad.status !== 400) fail(`petición inválida debería dar 400 (dio ${bad.status})`);
  else ok('petición inválida rechazada con 400');

  const m = await fetch(`${base}/api/music/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'prueba', durationSec: 5 }) });
  const mb = await m.text();
  if (m.ok || mb.includes(FAKE)) fail('error del proveedor musical mal gestionado');
  else ok(`error del proveedor musical controlado (${m.status} ${JSON.parse(mb).error.code})`);
  const caps2 = await (await fetch(`${base}/api/capabilities`)).json();
  if (caps2.music.remainingToday !== caps2.music.dailyLimit) fail('un fallo del proveedor no debería consumir cupo');
  else ok('un fallo del proveedor no consume cupo diario');

  const long = await fetch(`${base}/api/music/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'prueba', durationSec: 999 }) });
  if (long.status !== 400) fail('duración excesiva debería rechazarse');
  else ok('duración por encima del límite rechazada');

  if (logs.includes(FAKE)) fail('los registros del servidor imprimen la clave');
  else ok('los registros del servidor no imprimen la clave');
} catch (e) {
  fail(`error ejecutando comprobaciones: ${e.message}`);
} finally {
  server.kill();
}
process.exit(failures ? 1 : 0);
