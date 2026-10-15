#!/usr/bin/env node
/**
 * Genera un único HTML autocontenido (JS, CSS y fuentes incrustados) para
 * publicar la app como vista previa en un marco restringido. Activa el modo
 * EMBEDDED, que oculta descargas y micrófono y lo explica en la interfaz.
 * Uso: node scripts/build-embedded.mjs [salida.html]
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const outDir = 'dist-embedded';
const target = process.argv[2] ?? path.join(outDir, 'emotion-engine.html');
process.env.VITE_EMBEDDED = '1';

await build({
  configFile: false,
  base: './',
  plugins: [react()],
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { output: { codeSplitting: false } },
  },
});

const assets = path.join(outDir, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(path.join(assets, f), 'utf8'));
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(path.join(assets, f), 'utf8'));
if (js.length !== 1) throw new Error(`Se esperaba un único bundle JS y hay ${js.length}`);
const safeJs = js[0].replace(/<\/script/gi, '<\\/script');
const html = `<title>EMOTION ENGINE</title>
<meta name="description" content="Estudio audiovisual generativo e interactivo en el navegador.">
<style>${css.join('\n')}</style>
<div id="root"></div>
<script type="module">${safeJs}</script>
`;
writeFileSync(target, html);
console.log(`${target} · ${(html.length / 1024 / 1024).toFixed(2)} MB`);
