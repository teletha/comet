import { build } from 'esbuild';

build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/worker.js',
  platform: 'neutral',
  format: 'esm',
  target: ['es2022'],
  sourcemap: true,
  minify: false,
  external: [],
}).catch(() => process.exit(1));
