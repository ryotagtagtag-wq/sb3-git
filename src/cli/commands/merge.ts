// Merge command: three-way merge
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { importSB3 } from '../../codec/sb3.js'
import { normalize } from '../../codec/normalize.js'
import { assignSemanticIds } from '../../algo/id-assign.js'
import { threeWayMerge } from '../../algo/three-way-merge.js'
import { exportSB3 } from '../../codec/sb3.js'
import { extractAssets } from '../../codec/sb3.js'

export const mergeCommand = new Command('merge')
  .description('Three-way merge of SB3 projects')
  .argument('<base>', 'Base .sb3 file')
  .argument('<ours>', 'Our .sb3 file')
  .argument('<theirs>', 'Their .sb3 file')
  .argument('<output>', 'Output .sb3 file')
  .option('--auto-resolve', 'Automatically resolve conflicts preferring ours')
  .action(async (base: string, ours: string, theirs: string, output: string, options: { autoResolve?: boolean }) => {
    console.log(`Three-way merge:`)
    console.log(`  Base: ${base}`)
    console.log(`  Ours: ${ours}`)
    console.log(`  Theirs: ${theirs}`)
    console.log(`  Output: ${output}`)
    
    // Import all three .sb3 files
    const baseBuffer = readFileSync(base)
    const oursBuffer = readFileSync(ours)
    const theirsBuffer = readFileSync(theirs)
    
    const baseSb3Project = await importSB3(baseBuffer)
    const oursSb3Project = await importSB3(oursBuffer)
    const theirsSb3Project = await importSB3(theirsBuffer)
    
    // Normalize and assign semantic IDs
    const baseNormalized = normalize(baseSb3Project)
    const oursNormalized = normalize(oursSb3Project)
    const theirsNormalized = normalize(theirsSb3Project)
    
    const baseProj = assignSemanticIds(baseNormalized)
    const oursProj = assignSemanticIds(oursNormalized)
    const theirsProj = assignSemanticIds(theirsNormalized)
    
    // Perform three-way merge
    const { project: mergedProject, conflicts } = threeWayMerge(baseProj, oursProj, theirsProj)
    
    if (conflicts.length > 0) {
      console.log(`\nConflicts detected: ${conflicts.length}`)
      for (const conflict of conflicts) {
        console.log(`  ${conflict.path}: ${conflict.reason}`)
      }
      
      if (!options.autoResolve) {
        console.log(`\nUse --auto-resolve to automatically resolve conflicts preferring ours.`)
        process.exit(1)
      }
      
      console.log(`\nAuto-resolving conflicts preferring ours...`)
    }
    
    // Extract assets from all three projects and merge
    const baseAssets = await extractAssets(baseBuffer)
    const oursAssets = await extractAssets(oursBuffer)
    const theirsAssets = await extractAssets(theirsBuffer)
    
    // Merge assets (ours takes precedence, then theirs, then base)
    const mergedAssets = new Map<string, Buffer>()
    for (const [k, v] of baseAssets) mergedAssets.set(k, v)
    for (const [k, v] of theirsAssets) mergedAssets.set(k, v)
    for (const [k, v] of oursAssets) mergedAssets.set(k, v)
    
    // Export merged project
    const mergedBuffer = await exportSB3(mergedProject, mergedAssets)
    
    // Write output
    const { writeFileSync } = await import('fs')
    writeFileSync(output, mergedBuffer)
    
    console.log(`\n✓ Merge complete: ${output}`)
    console.log(`  Conflicts: ${conflicts.length}`)
    console.log(`  Targets: ${mergedProject.targets.length}`)
  })
