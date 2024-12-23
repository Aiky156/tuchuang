const esbuild = require('esbuild');
const { nodeExternalsPlugin } = require('esbuild-node-externals');

async function build() {
  try {
    await esbuild.build({
      entryPoints: [
        'functions/api/delete.js',
        'functions/api/images.js',
        'functions/api/upload.js',
        'functions/api/utils.js'
      ],
      bundle: true,
      outdir: 'dist/functions',
      platform: 'node',
      format: 'esm',
      plugins: [nodeExternalsPlugin()],
      external: ['@octokit/rest']
    });
    console.log('Build completed successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build(); 