import { defineConfig } from "tsup"

export default defineConfig({
  entry: { "hataroo-cli": "src/cli.tsx" },
  format: "esm",
  platform: "node",
  target: "node22",
  bundle: true,
  splitting: false,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __hatarooCreateRequire } from "node:module";\nconst require = __hatarooCreateRequire(import.meta.url);',
  },
  noExternal: [/.*/],
  esbuildOptions(options) {
    options.alias = {
      "react-devtools-core": "./src/shims/react-devtools-core.ts",
    }
  },
})
