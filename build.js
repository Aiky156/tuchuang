const esbuild = require('esbuild');
const { nodeExternalsPlugin } = require('esbuild-node-externals');

esbuild.build({
  entryPoints: [
    'functions/api/delete.js',
    'functions/api/images.js',
    'functions/api/upload.js'
  ],
  bundle: true,
  outdir: 'dist/functions',
  format: 'esm',
  platform: 'node',
  target: 'es2020',
  plugins: [nodeExternalsPlugin()],
  external: ['@octokit/rest'],
}).catch(() => process.exit(1)); 