// Diff command: HTML diff reports between two versions
import { Command } from 'commander'
import { readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'fs'
import { importSB3, extractAssets } from '../../codec/sb3.js'
import { normalize } from '../../codec/normalize.js'
import { assignSemanticIds } from '../../algo/id-assign.js'
import { diffProjects } from '../../algo/diff.js'
import { generateDiffHTML } from '../../render/diff-html.js'

export const diffCommand = new Command('diff')
  .description('Generate HTML diff report between two SB3 files or expanded projects')
  .argument('<base>', 'Base SB3 file or expanded project directory')
  .argument('<modified>', 'Modified SB3 file or expanded project directory')
  .option('-o, --output <file>', 'Output HTML file (default: diff-report.html)')
  .option('--json', 'Output JSON diff instead of HTML')
  .option('--base-label <label>', 'Label for base version', 'Base')
  .option('--new-label <label>', 'Label for modified version', 'Modified')
  .action(async (base: string, modified: string, options: { output?: string; json?: boolean; baseLabel?: string; newLabel?: string }) => {
    console.log(`Generating diff between ${base} and ${modified}...`)
    
    let baseProject: any
    let modifiedProject: any
    
    // Check if inputs are .sb3 files or directories
    const isBaseSb3 = base.endsWith('.sb3')
    const isModifiedSb3 = modified.endsWith('.sb3')
    
    if (isBaseSb3 && isModifiedSb3) {
      // Both are .sb3 files - use SB3Codec directly
      const baseBuffer = readFileSync(base)
      const modifiedBuffer = readFileSync(modified)
      
      const baseSb3Project = await importSB3(baseBuffer)
      const modifiedSb3Project = await importSB3(modifiedBuffer)
      
      const baseNormalized = normalize(baseSb3Project)
      const modifiedNormalized = normalize(modifiedSb3Project)
      
      const baseProj = assignSemanticIds(baseNormalized)
      const modifiedProj = assignSemanticIds(modifiedNormalized)
      
      baseProject = baseProj
      modifiedProject = modifiedProj
    } else {
      console.error('Directory-based diff not yet implemented. Please use .sb3 files.')
      process.exit(1)
    }
    
    const diff = diffProjects(baseProject, modifiedProject)
    
    if (options.json) {
      console.log(JSON.stringify(diff, null, 2))
      return
    }
    
    const html = generateDiffHTML(diff, {
      title: `SB3 Diff: ${options.baseLabel} → ${options.newLabel}`,
      baseLabel: options.baseLabel,
      newLabel: options.newLabel
    })
    
    const outputFile = options.output || 'diff-report.html'
    await writeFile(outputFile, html)
    console.log(`✓ Diff report written to ${outputFile}`)
    
    // Print summary
    let totalChanges = 0
    for (const target of diff.targets) {
      for (const script of target.scripts) {
        for (const block of script.blocks) {
          if (block.type !== 'unchanged') totalChanges++
        }
      }
      totalChanges += target.comments.filter((c: any) => c.type !== 'unchanged').length
      totalChanges += target.costumes.filter((c: any) => c.type !== 'unchanged').length
      totalChanges += target.sounds.filter((s: any) => s.type !== 'unchanged').length
      totalChanges += target.properties.length
    }
    
    console.log(`\nSummary: ${totalChanges} changes detected`)
    console.log(`  Targets: ${diff.targets.length}`)
    console.log(`  Monitors: ${diff.monitors.filter((m: any) => m.type !== 'unchanged').length} changed`)
    console.log(`  Extensions: ${diff.extensions.filter((e: any) => e.type !== 'unchanged').length} changed`)
  })
