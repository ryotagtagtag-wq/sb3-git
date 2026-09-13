// Project integrity checking
import type { IntermediateProject, IntermediateTarget, IntermediateScript, IntermediateBlock } from '../codec/types.js'

export interface IntegrityIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  path: string
  details?: unknown
}

export function checkIntegrity(project: IntermediateProject): IntegrityIssue[] {
  const issues: IntegrityIssue[] = []
  
  // Check for duplicate semantic IDs
  const semanticIds = new Map<string, string[]>()
  collectSemanticIds(project, semanticIds)
  
  for (const [id, paths] of semanticIds) {
    if (paths.length > 1) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_SEMANTIC_ID',
        message: `Duplicate semantic ID: ${id}`,
        path: paths.join(', '),
        details: { id, paths }
      })
    }
  }
  
  // Check block references
  for (const target of project.targets) {
    for (const script of target.scripts) {
      checkScriptIntegrity(script, target.semanticId, issues)
    }
    
    // Check comment references
    for (const comment of target.comments) {
      if (comment.blockSemanticId) {
        const block = findBlockBySemanticId(project, comment.blockSemanticId)
        if (!block) {
          issues.push({
            severity: 'warning',
            code: 'ORPHAN_COMMENT',
            message: `Comment references non-existent block: ${comment.blockSemanticId}`,
            path: `${target.semanticId}.comments.${comment.id}`,
            details: { commentId: comment.id, blockSemanticId: comment.blockSemanticId }
          })
        }
      }
    }
    
    // Check for empty scripts
    for (const script of target.scripts) {
      if (script.blocks.length === 0) {
        issues.push({
          severity: 'warning',
          code: 'EMPTY_SCRIPT',
          message: `Empty script: ${script.semanticId}`,
          path: `${target.semanticId}.scripts.${script.semanticId}`
        })
      }
    }
  }
  
  // Check for missing assets (costumes/sounds referenced but not present)
  // This would require checking against asset files
  
  // Check project structure
  if (project.targets.length === 0) {
    issues.push({
      severity: 'error',
      code: 'NO_TARGETS',
      message: 'Project has no targets',
      path: 'targets'
    })
  }
  
  // Check for stage target
  const hasStage = project.targets.some(t => t.name === 'Stage' || t.semanticId.startsWith('target_0'))
  if (!hasStage) {
    issues.push({
      severity: 'warning',
      code: 'NO_STAGE',
      message: 'Project may be missing Stage target',
      path: 'targets'
    })
  }
  
  return issues
}

function collectSemanticIds(project: IntermediateProject, map: Map<string, string[]>): void {
  for (const target of project.targets) {
    addToMap(map, target.semanticId, `targets.${target.semanticId}`)
    
    for (const script of target.scripts) {
      addToMap(map, script.semanticId, `${target.semanticId}.scripts.${script.semanticId}`)
      
      for (const block of script.blocks) {
        addToMap(map, block.semanticId, `${target.semanticId}.scripts.${script.semanticId}.blocks.${block.semanticId}`)
      }
    }
    
    for (const costume of target.costumes) {
      addToMap(map, costume.semanticId, `${target.semanticId}.costumes.${costume.semanticId}`)
    }
    
    for (const sound of target.sounds) {
      addToMap(map, sound.semanticId, `${target.semanticId}.sounds.${sound.semanticId}`)
    }
  }
  
  for (const monitor of project.monitors) {
    addToMap(map, monitor.semanticId, `monitors.${monitor.semanticId}`)
  }
}

function addToMap(map: Map<string, string[]>, id: string, path: string): void {
  const existing = map.get(id) || []
  existing.push(path)
  map.set(id, existing)
}

function checkScriptIntegrity(script: IntermediateScript, targetPath: string, issues: IntegrityIssue[]): void {
  const blockIds = new Set(script.blocks.map(b => b.semanticId))
  
  for (const block of script.blocks) {
    // Check next reference
    if (block.next) {
      const nextBlock = script.blocks.find(b => b.semanticId === block.next || b.id === block.next)
      if (!nextBlock) {
        issues.push({
          severity: 'warning',
          code: 'BROKEN_NEXT_REF',
          message: `Block references non-existent next block: ${block.next}`,
          path: `${targetPath}.scripts.${script.semanticId}.blocks.${block.semanticId}`,
          details: { blockSemanticId: block.semanticId, nextRef: block.next }
        })
      }
    }
    
    // Check parent reference
    if (block.parent) {
      const parentBlock = script.blocks.find(b => b.semanticId === block.parent || b.id === block.parent)
      if (!parentBlock) {
        issues.push({
          severity: 'warning',
          code: 'BROKEN_PARENT_REF',
          message: `Block references non-existent parent block: ${block.parent}`,
          path: `${targetPath}.scripts.${script.semanticId}.blocks.${block.semanticId}`,
          details: { blockSemanticId: block.semanticId, parentRef: block.parent }
        })
      }
    }
    
    // Check input block references
    for (const [inputName, input] of Object.entries(block.inputs)) {
      const value = input[1]
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'semanticId' in value) {
        const refId = (value as { semanticId: string }).semanticId
        if (!blockIds.has(refId)) {
          issues.push({
            severity: 'warning',
            code: 'BROKEN_INPUT_REF',
            message: `Block input references non-existent block: ${refId}`,
            path: `${targetPath}.scripts.${script.semanticId}.blocks.${block.semanticId}.inputs.${inputName}`,
            details: { blockSemanticId: block.semanticId, inputName, refId }
          })
        }
      }
    }
  }
  
  // Check for orphaned blocks (not reachable from top-level)
  const reachable = new Set<string>()
  const topLevelBlocks = script.blocks.filter(b => b.topLevel)
  for (const block of topLevelBlocks) {
    collectReachable(block, script.blocks, reachable)
  }
  
  for (const block of script.blocks) {
    if (!reachable.has(block.semanticId) && !block.shadow) {
      issues.push({
        severity: 'info',
        code: 'ORPHAN_BLOCK',
        message: `Block not reachable from top-level: ${block.semanticId}`,
        path: `${targetPath}.scripts.${script.semanticId}.blocks.${block.semanticId}`,
        details: { blockSemanticId: block.semanticId }
      })
    }
  }
}

function collectReachable(block: IntermediateBlock, allBlocks: IntermediateBlock[], reachable: Set<string>): void {
  if (reachable.has(block.semanticId)) return
  reachable.add(block.semanticId)
  
  // Follow next
  if (block.next) {
    const next = allBlocks.find(b => b.semanticId === block.next || b.id === block.next)
    if (next) collectReachable(next, allBlocks, reachable)
  }
  
  // Follow inputs for nested blocks
  for (const input of Object.values(block.inputs)) {
    const value = input[1]
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'semanticId' in value) {
      const refId = (value as { semanticId: string }).semanticId
      const refBlock = allBlocks.find(b => b.semanticId === refId)
      if (refBlock) collectReachable(refBlock, allBlocks, reachable)
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && 'semanticId' in item) {
          const refId = (item as { semanticId: string }).semanticId
          const refBlock = allBlocks.find(b => b.semanticId === refId)
          if (refBlock) collectReachable(refBlock, allBlocks, reachable)
        }
      }
    }
  }
}

function findBlockBySemanticId(project: IntermediateProject, semanticId: string): IntermediateBlock | null {
  for (const target of project.targets) {
    for (const script of target.scripts) {
      const block = script.blocks.find(b => b.semanticId === semanticId)
      if (block) return block
    }
  }
  return null
}

export function printIntegrityReport(issues: IntegrityIssue[]): void {
  if (issues.length === 0) {
    console.log('✓ No integrity issues found')
    return
  }
  
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')
  const infos = issues.filter(i => i.severity === 'info')
  
  console.log(`\nIntegrity Report: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} infos\n`)
  
  for (const issue of issues) {
    const prefix = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ'
    console.log(`${prefix} [${issue.code}] ${issue.message}`)
    console.log(`   Path: ${issue.path}`)
    if (issue.details) {
      console.log(`   Details: ${JSON.stringify(issue.details, null, 2)}`)
    }
    console.log()
  }
}
