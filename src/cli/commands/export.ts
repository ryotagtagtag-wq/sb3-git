// Export command: intermediate format → .sb3
import { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { collapseFromFiles, collectAssetsFromFiles, intermediateToSB3 } from '../../codec/expand.js'
import { exportSB3 } from '../../codec/sb3.js'
import { writeFile } from 'node:fs/promises'

export const exportCommand = new Command('export')
  .description('Convert expanded intermediate format to .sb3 file')
  .argument('<input>', 'Input directory (expanded format)')
  .argument('<output>', 'Output .sb3 file path')
  .action(async (input: string, output: string) => {
    console.log(`Exporting ${input} to ${output}...`)
    
    const project = await collapseFromFiles(input)
    console.log(`  Collapsed project: ${project.targets.length} targets`)
    
    // Convert intermediate format to SB3 format (with blocks)
    const sb3Project = intermediateToSB3(project)
    
    const assets = await collectAssetsFromFiles(input)
    console.log(`  Collected ${assets.size} assets`)
    
    const buffer = await exportSB3(sb3Project, assets)
    await writeFile(output, buffer)
    console.log(`✓ Export complete: ${output}`)
  })
