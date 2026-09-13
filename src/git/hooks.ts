/**
 * Git Hooks Implementation
 * Actual hook logic called by git
 */

import { readSB3, writeSB3 } from '../codec/sb3.js';
import { sb3ToIntermediate, intermediateToSB3 } from '../codec/sb3.js';
import { normalizeProject } from '../codec/normalize.js';
import { assignSemanticIds } from '../algo/id-assign.js';
import { writeProjectToFs } from '../codec/expand.js';
import { readProjectFromFs } from '../codec/expand.js';
import { threeWayMerge } from '../algo/three-way-merge.js';
import { validateProjectIntegrity } from '../validate/integrity.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Textconv filter for git diff
 * Converts .sb3 to human-readable text for git diff
 */
export async function textconvFilter(sb3Path: string): Promise<string> {
  const { project, assets } = await readSB3(sb3Path);
  const intermediate = assignSemanticIds(normalizeProject(sb3ToIntermediate(project)));
  
  const lines: string[] = [];
  
  // Project header
  lines.push(`=== SB3 Project: ${sb3Path} ===`);
  lines.push(`Semver: ${intermediate.meta.semver}`);
  lines.push(`Targets: ${intermediate.targets.length}`);
  lines.push('');
  
  for (const target of intermediate.targets) {
    lines.push(`--- Target: ${target.name} (${target.isStage ? 'Stage' : 'Sprite'}) ---`);
    lines.push(`Layer: ${target.layerOrder}, Volume: ${target.volume}, Tempo: ${target.tempo}`);
    lines.push(`Variables: ${Object.keys(target.variables).length}`);
    lines.push(`Lists: ${Object.keys(target.lists).length}`);
    lines.push(`Scripts: ${target.scripts.length}`);
    lines.push(`Costumes: ${target.costumes.length}`);
    lines.push(`Sounds: ${target.sounds.length}`);
    lines.push('');
    
    for (const script of target.scripts) {
      lines.push(`  Script: ${script.id}`);
      for (const block of script.blocks) {
        const indent = block.topLevel ? '  ' : '    ';
        const inputStr = formatInputs(block.inputs);
        lines.push(`${indent}${block.id}: ${block.opcode} ${inputStr}`);
      }
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

function formatInputs(inputs: Record<string, any>): string {
  const parts: string[] = [];
  for (const [name, input] of Object.entries(inputs)) {
    switch (input.type) {
      case 'primitive':
        parts.push(`${name}=${input.value}`);
        break;
      case 'block':
        parts.push(`${name}→${input.blockId}`);
        break;
      case 'shadow':
        parts.push(`${name}⌄${input.blockId}`);
        break;
    }
  }
  return parts.length > 0 ? `{${parts.join(', ')}}` : '';
}

/**
 * Import .sb3 to intermediate format (expanded for git tracking)
 */
export async function importCommand(sb3Path: string, outputDir: string): Promise<void> {
  const { project, assets } = await readSB3(sb3Path);
  const intermediate = assignSemanticIds(normalizeProject(sb3ToIntermediate(project)));
  
  // Write expanded format
  await writeProjectToFs(intermediate, outputDir);
  
  // Also save asset files
  const assetsDir = join(outputDir, '..', 'assets');
  for (const [assetPath, content] of assets) {
    const assetFile = join(assetsDir, assetPath);
    await writeFile(assetFile, content);
  }
}

/**
 * Export intermediate format back to .sb3
 */
export async function exportCommand(inputDir: string, outputPath: string): Promise<void> {
  const intermediate = await readProjectFromFs(inputDir);
  const sb3Project = intermediateToSB3(intermediate);
  
  // Read assets
  const assets = new Map<string, Uint8Array>();
  const assetsDir = join(inputDir, '..', 'assets');
  
  // Would need to read actual asset files here
  // For now, create empty assets map
  
  await writeSB3(sb3Project, assets, outputPath);
}

/**
 * Three-way merge for git merge driver
 * Called as: sb3-git merge %O %A %B
 * %O = base, %A = ours, %B = theirs
 * Output should be written to %A
 */
export async function mergeDriver(basePath: string, oursPath: string, theirsPath: string): Promise<number> {
  try {
    const [baseProject, oursProject, theirsProject] = await Promise.all([
      readSB3(basePath).then(r => assignSemanticIds(normalizeProject(sb3ToIntermediate(r.project)))),
      readSB3(oursPath).then(r => assignSemanticIds(normalizeProject(sb3ToIntermediate(r.project)))),
      readSB3(theirsPath).then(r => assignSemanticIds(normalizeProject(sb3ToIntermediate(r.project)))),
    ]);
    
    const { project: merged, conflicts } = threeWayMerge(baseProject, oursProject, theirsProject);
    
    if (conflicts.length > 0) {
      console.error(`Merge conflicts detected: ${conflicts.length}`);
      for (const c of conflicts) {
        console.error(`  ${c.targetName}: ${c.description}`);
      }
      // Write merged result anyway (with conflict markers would be better)
      const mergedSb3 = intermediateToSB3(merged);
      // Note: assets would need to be merged too
      await writeSB3(mergedSb3, new Map(), oursPath);
      return 1; // Conflict exit code
    }
    
    // No conflicts, write merged result
    const mergedSb3 = intermediateToSB3(merged);
    await writeSB3(mergedSb3, new Map(), oursPath);
    return 0;
  } catch (error) {
    console.error('Merge failed:', error);
    return 1;
  }
}

/**
 * Validate command for CI
 */
export async function validateCommand(sb3Path: string): Promise<{ valid: boolean; errors: string[] }> {
  const { project } = await readSB3(sb3Path);
  const intermediate = assignSemanticIds(normalizeProject(sb3ToIntermediate(project)));
  const report = validateProjectIntegrity(intermediate);
  
  const errors = report.errors.map(e => `${e.path || 'root'}: ${e.message}`);
  const warnings = report.warnings.map(w => `${w.path || 'root'}: ${w.message}`);
  
  return {
    valid: report.valid,
    errors: [...errors, ...warnings],
  };
}

/**
 * Check conflicts in PR
 */
export async function checkConflictsCommand(
  sb3Path: string,
  baseRef: string,
  headRef: string
): Promise<{ hasConflicts: boolean; conflicts: any[] }> {
  // This would need git to get the base and head versions
  // For now, return placeholder
  return { hasConflicts: false, conflicts: [] };
}

/**
 * Generate diff report for PR
 */
export async function diffCommand(
  sb3Path: string,
  baseRef: string,
  headRef: string,
  outputDir: string
): Promise<void> {
  // Would generate HTML diff report
  // Placeholder for now
  await writeFile(join(outputDir, 'diff.html'), '<html><body><h1>Diff Report</h1></body></html>');
}
