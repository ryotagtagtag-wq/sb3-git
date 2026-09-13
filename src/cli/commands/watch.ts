// Watch command: file watching for live diff
import { Command } from 'commander'

export const watchCommand = new Command('watch')
  .description('Watch for changes and show live diff (stub)')
  .argument('<input>', 'Input directory to watch')
  .option('-p, --port <number>', 'Port for live server', '3000')
  .action((input: string, options: { port?: string }) => {
    console.log(`Watch mode not yet implemented`)
    console.log(`Would watch ${input} on port ${options.port}`)
    console.log(`This would integrate with TurboWarp Desktop via WebSocket`)
  })
