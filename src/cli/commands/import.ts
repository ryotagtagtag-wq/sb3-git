// Import command: .sb3 → expanded intermediate format
import { Command } from 'commander'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importSB3, extractAssets } from '../../codec/sb3.js'
import { normalize } from '../../codec/normalize.js'
import { assignSemanticIds } from '../../algo/id-assign.js'
import { expandToFiles, extractAssetsToFiles } from '../../codec/expand.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const importCommand = new Command('import')
  .description('Convert .sb3 file to expanded intermediate format')
  .argument('<input>', 'Input .sb3 file path')
  .option('-o, --output <dir>', 'Output directory (default: input name + .expanded)')
  .option('--no-assets', 'Skip asset extraction')
  .action(async (input: string, options: { output?: string; assets?: boolean }) => {
    const outputDir = options.output || `${input.replace(/\.sb3$/i, '')}.expanded`
    
    console.log(`Importing ${input}...`)
    
    const buffer = await readFile(input)
    const sb3Project = await importSB3(buffer)
    console.log(`  Parsed SB3: ${sb3Project.targets.length} targets`)
    
    const normalized = normalize(sb3Project)
    console.log(`  Normalized`)
    
    const withIds = assignSemanticIds(normalized)
    console.log(`  Assigned semantic IDs`)
    
    await mkdir(outputDir, { recursive: true })
    await expandToFiles(withIds, outputDir)
    console.log(`  Expanded to ${outputDir}`)
    
    if (options.assets !== false) {
      const assets = await extractAssets(buffer)
      await extractAssetsToFiles(assets, outputDir)
      console.log(`  Extracted ${assets.size} assets`)
    }
    
    console.log(`✓ Import complete: ${outputDir}`)
  })
