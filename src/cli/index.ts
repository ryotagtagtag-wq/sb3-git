import { Command } from 'commander'
import { importCommand } from './commands/import.js'
import { exportCommand } from './commands/export.js'
import { diffCommand } from './commands/diff.js'
import { mergeCommand } from './commands/merge.js'
import { validateCommand } from './commands/validate.js'
import { watchCommand } from './commands/watch.js'

const program = new Command()

program
  .name('sb3-git')
  .description('Git/GitHub collaborative development for Scratch .sb3 projects')
  .version('0.1.0')

program.addCommand(importCommand)
program.addCommand(exportCommand)
program.addCommand(diffCommand)
program.addCommand(mergeCommand)
program.addCommand(validateCommand)
program.addCommand(watchCommand)

program.parse()
