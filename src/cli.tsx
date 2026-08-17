import { render } from 'ink'
import { resolve } from 'node:path'
import { parseArgs } from '@/core/args.js'
import { App } from './ui/App.js'

const { dir, depth, ignore } = parseArgs(process.argv.slice(2))
const root = resolve(dir ?? process.cwd())

render(<App root={root} depth={depth} ignore={ignore} />)
