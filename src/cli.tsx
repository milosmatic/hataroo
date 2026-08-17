import { render } from 'ink'
import { resolve } from 'node:path'
import { App } from './ui/App.js'

const dir = process.argv[2]
const root = resolve(dir ?? process.cwd())

render(<App root={root} />)
