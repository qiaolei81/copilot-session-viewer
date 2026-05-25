import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');

const backendOptions = {
  entryPoints: ['server.js'],
  outfile: 'dist/server.min.js',
  platform: 'node',
  format: 'cjs',
  bundle: true,
  minify: isProd,
  sourcemap: !isProd,
  packages: 'external',
  target: ['node22'],
};

async function build() {
  // Frontend is now built by Vite (npm run build:client)

  // Build backend bundle
  if (isWatch) {
    const ctx = await esbuild.context(backendOptions);
    await ctx.watch();
    console.log('👀 Watching server.js...');
  } else {
    await esbuild.build(backendOptions);
    console.log(`✅ Built ${backendOptions.outfile}`);
  }

  if (!isWatch) {
    console.log('\n📦 Build complete!');
  } else {
    console.log('\n👀 Watching for changes...');
  }
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
