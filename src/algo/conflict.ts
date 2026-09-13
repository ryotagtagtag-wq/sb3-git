/**
 * Conflict Detection and Resolution UI
 * Provides utilities for displaying and resolving merge conflicts
 */

import { MergeConflict } from './three-way-merge.js';

export interface ConflictResolution {
  conflictId: string;
  resolution: 'ours' | 'theirs' | 'manual';
  manualValue?: any;
}

export interface ConflictReport {
  totalConflicts: number;
  byType: Record<string, number>;
  conflicts: DetailedConflict[];
}

export interface DetailedConflict {
  id: string;
  type: MergeConflict['type'];
  targetName: string;
  scriptId?: string;
  blockId?: string;
  field?: string;
  description: string;
  base?: any;
  ours?: any;
  theirs?: any;
  canAutoResolve: boolean;
  suggestedResolution?: 'ours' | 'theirs';
}

/**
 * Generate a human-readable conflict report
 */
export function generateConflictReport(conflicts: MergeConflict[]): ConflictReport {
  const byType: Record<string, number> = {};
  const detailed: DetailedConflict[] = [];
  
  for (let i = 0; i < conflicts.length; i++) {
    const c = conflicts[i];
    byType[c.type] = (byType[c.type] || 0) + 1;
    
    const canAutoResolve = canResolveAutomatically(c);
    let suggestedResolution: 'ours' | 'theirs' | undefined;
    
    if (canAutoResolve) {
      suggestedResolution = suggestResolution(c);
    }
    
    detailed.push({
      id: `conflict_${i}`,
      type: c.type,
      targetName: c.targetName,
      scriptId: c.scriptId,
      blockId: c.blockId,
      field: c.field,
      description: c.description,
      base: c.base,
      ours: c.ours,
      theirs: c.theirs,
      canAutoResolve,
      suggestedResolution,
    });
  }
  
  return {
    totalConflicts: conflicts.length,
    byType,
    conflicts: detailed,
  };
}

function canResolveAutomatically(conflict: MergeConflict): boolean {
  // Property conflicts where one side matches base can be auto-resolved
  if (conflict.type === 'property' && conflict.base !== undefined) {
    const baseStr = JSON.stringify(conflict.base);
    const oursStr = JSON.stringify(conflict.ours);
    const theirsStr = JSON.stringify(conflict.theirs);
    
    if (baseStr === oursStr && baseStr !== theirsStr) return true; // theirs changed
    if (baseStr === theirsStr && baseStr !== oursStr) return true; // ours changed
  }
  
  // Block conflicts where content is identical
  if (conflict.type === 'block' && conflict.ours && conflict.theirs) {
    if (JSON.stringify(conflict.ours) === JSON.stringify(conflict.theirs)) return true;
  }
  
  // Asset ref conflicts (content-addressed)
  if (conflict.type === 'asset') return true;
  
  return false;
}

function suggestResolution(conflict: MergeConflict): 'ours' | 'theirs' {
  if (conflict.type === 'property' && conflict.base !== undefined) {
    const baseStr = JSON.stringify(conflict.base);
    const oursStr = JSON.stringify(conflict.ours);
    const theirsStr = JSON.stringify(conflict.theirs);
    
    if (baseStr === oursStr) return 'theirs'; // theirs changed
    if (baseStr === theirsStr) return 'ours'; // ours changed
  }
  
  // Default to ours
  return 'ours';
}

/**
 * Apply resolutions to a merged project
 */
export function applyResolutions(
  project: any,
  conflicts: MergeConflict[],
  resolutions: ConflictResolution[]
): any {
  // This would modify the project based on resolutions
  // For now, the merge already defaults to 'ours'
  // Manual resolutions would require more complex logic
  return project;
}

/**
 * Format conflict for CLI display
 */
export function formatConflictForCli(conflict: MergeConflict): string {
  const lines: string[] = [];
  lines.push(`⚠️  Conflict: ${conflict.type} in ${conflict.targetName}`);
  
  if (conflict.scriptId) lines.push(`   Script: ${conflict.scriptId}`);
  if (conflict.blockId) lines.push(`   Block: ${conflict.blockId}`);
  if (conflict.field) lines.push(`   Field: ${conflict.field}`);
  
  lines.push(`   ${conflict.description}`);
  
  if (conflict.base !== undefined) {
    lines.push(`   Base:    ${JSON.stringify(conflict.base).substring(0, 100)}`);
  }
  if (conflict.ours !== undefined) {
    lines.push(`   Ours:    ${JSON.stringify(conflict.ours).substring(0, 100)}`);
  }
  if (conflict.theirs !== undefined) {
    lines.push(`   Theirs:  ${JSON.stringify(conflict.theirs).substring(0, 100)}`);
  }
  
  return lines.join('\n');
}

/**
 * Interactive conflict resolver (for future CLI integration)
 */
export async function resolveConflictsInteractively(
  conflicts: MergeConflict[]
): Promise<ConflictResolution[]> {
  // Placeholder for interactive resolution
  // Would use inquirer or similar for CLI prompts
  return conflicts.map((c, i) => ({
    conflictId: `conflict_${i}`,
    resolution: 'ours' as const,
  }));
}
