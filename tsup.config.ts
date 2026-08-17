import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'tsup'

const srcDir = fileURLToPath(new URL('src', import.meta.url))

/** Resolves the `@/*` path alias (see tsconfig.json) to `src/*` for the bundler. */
const resolveAtAlias: Plugin = {
  name: 'resolve-at-alias',
  esbuildOptions(options) {
    options.plugins ??= []
    options.plugins.push({
      name: 'resolve-at-alias',
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => ({
          path: resolve(srcDir, args.path.slice(2)),
        }))
      },
    })
  },
}

export default defineConfig({
  entry: { 'hataroo-cli': 'src/cli.tsx' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  bundle: true,
  splitting: false,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __hatarooCreateRequire } from "node:module";\nconst require = __hatarooCreateRequire(import.meta.url);',
  },
  noExternal: [/.*/],
  plugins: [resolveAtAlias],
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      'react-devtools-core': './src/shims/react-devtools-core.ts',
    }
  },
})
