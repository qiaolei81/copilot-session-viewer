import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');

const frontendEntries = [
  { entryPoints: ['src/frontend/homepage.js'], outfile: 'public/js/homepage.min.js' },
  { entryPoints: ['src/frontend/session-detail.js'], outfile: 'public/js/session-detail.min.js' },
  { entryPoints: ['src/frontend/time-analyze.js'], outfile: 'public/js/time-analyze.min.js' },
  { entryPoints: ['src/frontend/telemetry-browser.js'], outfile: 'public/js/telemetry-browser.min.js' },
];

const frontendOptions = {
  bundle: true,
  minify: true,
  sourcemap: !isProd,
  target: ['es2020'],
  format: 'iife',
};

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
  // Build frontend bundles
  for (const entry of frontendEntries) {
    if (isWatch) {
      const ctx = await esbuild.context({ ...frontendOptions, ...entry });
      await ctx.watch();
      console.log(`👀 Watching ${entry.entryPoints[0]}...`);
    } else {
      await esbuild.build({ ...frontendOptions, ...entry });
      console.log(`✅ Built ${entry.outfile}`);
    }
  }

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
