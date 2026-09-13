// Block-level diff with 3-phase matching
import { diffChars } from 'diff'
import type { 
  IntermediateProject, 
  IntermediateTarget, 
  IntermediateScript, 
  IntermediateBlock,
  IntermediateComment,
  IntermediateCostume,
  IntermediateSound,
  IntermediateMonitor,
  IntermediateExtension
} from '../codec/types.js'

export interface BlockDiff {
  semanticId: string
  type: 'unchanged' | 'added' | 'removed' | 'modified'
  baseBlock?: IntermediateBlock
  newBlock?: IntermediateBlock
  changes?: FieldChange[]
}

export interface FieldChange {
  field: string
  oldValue: unknown
  newValue: unknown
}

export interface ScriptDiff {
  semanticId: string
  blocks: BlockDiff[]
}

export interface TargetDiff {
  semanticId: string
  name: string
  scripts: ScriptDiff[]
  comments: CommentDiff[]
  costumes: AssetDiff[]
  sounds: AssetDiff[]
  properties: PropertyDiff[]
}

export interface CommentDiff {
  id: string
  type: 'unchanged' | 'added' | 'removed' | 'modified'
  oldComment?: { text: string; x: number; y: number }
  newComment?: { text: string; x: number; y: number }
}

export interface AssetDiff {
  semanticId: string
  name: string
  type: 'unchanged' | 'added' | 'removed' | 'modified'
  oldMd5?: string
  newMd5?: string
}

export interface PropertyDiff {
  property: string
  oldValue: unknown
  newValue: unknown
}

export interface ProjectDiff {
  targets: TargetDiff[]
  monitors: MonitorDiff[]
  extensions: ExtensionDiff[]
}

export interface MonitorDiff {
  semanticId: string
  type: 'unchanged' | 'added' | 'removed' | 'modified'
  changes?: FieldChange[]
}

export interface ExtensionDiff {
  name: string
  type: 'unchanged' | 'added' | 'removed' | 'modified'
  oldVersion?: string
  newVersion?: string
}

export function diffProjects(base: IntermediateProject, modified: IntermediateProject): ProjectDiff {
  return {
    targets: diffTargets(base.targets, modified.targets),
    monitors: diffMonitors(base.monitors, modified.monitors),
    extensions: diffExtensions(base.extensions, modified.extensions)
  }
}

function diffTargets(baseTargets: IntermediateTarget[], newTargets: IntermediateTarget[]): TargetDiff[] {
  const result: TargetDiff[] = []
  const baseMap = new Map(baseTargets.map(t => [t.semanticId, t]))
  const newMap = new Map(newTargets.map(t => [t.semanticId, t]))
  const allIds = new Set([...baseMap.keys(), ...newMap.keys()])
  
  for (const id of allIds) {
    const base = baseMap.get(id)
    const newTarget = newMap.get(id)
    
    if (base && newTarget) {
      result.push({
        semanticId: id,
        name: newTarget.name,
        scripts: diffScripts(base.scripts, newTarget.scripts),
        comments: diffComments(base.comments, newTarget.comments),
        costumes: diffAssets(base.costumes, newTarget.costumes),
        sounds: diffAssets(base.sounds, newTarget.sounds),
        properties: diffTargetProperties(base, newTarget)
      })
    } else if (base && !newTarget) {
      result.push({
        semanticId: id,
        name: base.name,
        scripts: base.scripts.map(s => ({ semanticId: s.semanticId, blocks: s.blocks.map(b => ({ semanticId: b.semanticId, type: 'removed' as const, baseBlock: b })) })),
        comments: base.comments.map(c => ({ id: c.id, type: 'removed' as const, oldComment: { text: c.text, x: c.x, y: c.y } })),
        costumes: base.costumes.map(c => ({ semanticId: c.semanticId, name: c.name, type: 'removed' as const })),
        sounds: base.sounds.map(s => ({ semanticId: s.semanticId, name: s.name, type: 'removed' as const })),
        properties: []
      })
    } else if (!base && newTarget) {
      result.push({
        semanticId: id,
        name: newTarget.name,
        scripts: newTarget.scripts.map(s => ({ semanticId: s.semanticId, blocks: s.blocks.map(b => ({ semanticId: b.semanticId, type: 'added' as const, newBlock: b })) })),
        comments: newTarget.comments.map(c => ({ id: c.id, type: 'added' as const, newComment: { text: c.text, x: c.x, y: c.y } })),
        costumes: newTarget.costumes.map(c => ({ semanticId: c.semanticId, name: c.name, type: 'added' as const })),
        sounds: newTarget.sounds.map(s => ({ semanticId: s.semanticId, name: s.name, type: 'added' as const })),
        properties: []
      })
    }
  }
  
  return result
}

function diffScripts(baseScripts: IntermediateScript[], newScripts: IntermediateScript[]): ScriptDiff[] {
  const result: ScriptDiff[] = []
  const baseMap = new Map(baseScripts.map(s => [s.semanticId, s]))
  const newMap = new Map(newScripts.map(s => [s.semanticId, s]))
  const allIds = new Set([...baseMap.keys(), ...newMap.keys()])
  
  for (const id of allIds) {
    const base = baseMap.get(id)
    const newScript = newMap.get(id)
    
    if (base && newScript) {
      result.push({
        semanticId: id,
        blocks: diffBlocks(base.blocks, newScript.blocks)
      })
    } else if (base && !newScript) {
      result.push({
        semanticId: id,
        blocks: base.blocks.map(b => ({ semanticId: b.semanticId, type: 'removed' as const, baseBlock: b }))
      })
    } else if (!base && newScript) {
      result.push({
        semanticId: id,
        blocks: newScript.blocks.map(b => ({ semanticId: b.semanticId, type: 'added' as const, newBlock: b }))
      })
    }
  }
  
  return result
}

function diffBlocks(baseBlocks: IntermediateBlock[], newBlocks: IntermediateBlock[]): BlockDiff[] {
  const result: BlockDiff[] = []
  const baseMap = new Map(baseBlocks.map(b => [b.semanticId, b]))
  const newMap = new Map(newBlocks.map(b => [b.semanticId, b]))
  const allIds = new Set([...baseMap.keys(), ...newMap.keys()])
  
  // Phase 1: Match by semantic ID
  for (const id of allIds) {
    const base = baseMap.get(id)
    const newBlock = newMap.get(id)
    
    if (base && newBlock) {
      if (blocksEqual(base, newBlock)) {
        result.push({ semanticId: id, type: 'unchanged', baseBlock: base, newBlock })
      } else {
        result.push({ 
          semanticId: id, 
          type: 'modified', 
          baseBlock: base, 
          newBlock,
          changes: diffBlockFields(base, newBlock)
        })
      }
      baseMap.delete(id)
      newMap.delete(id)
    }
  }
  
  // Phase 2: Match by content hash (for moved blocks)
  for (const [id, base] of baseMap) {
    let matched = false
    for (const [newId, newBlock] of newMap) {
      if (base.contentHash === newBlock.contentHash) {
        result.push({ 
          semanticId: newId, 
          type: 'modified', 
          baseBlock: base, 
          newBlock,
          changes: [{ field: 'position', oldValue: base.semanticId, newValue: newBlock.semanticId }]
        })
        newMap.delete(newId)
        matched = true
        break
      }
    }
    if (!matched) {
      result.push({ semanticId: id, type: 'removed', baseBlock: base })
    }
  }
  
  // Phase 3: Remaining unmatched new blocks
  for (const [id, newBlock] of newMap) {
    result.push({ semanticId: id, type: 'added', newBlock })
  }
  
  return result
}

function blocksEqual(a: IntermediateBlock, b: IntermediateBlock): boolean {
  return a.opcode === b.opcode &&
         a.next === b.next &&
         a.parent === b.parent &&
         a.shadow === b.shadow &&
         a.topLevel === b.topLevel &&
         a.x === b.x &&
         a.y === b.y &&
         JSON.stringify(a.inputs) === JSON.stringify(b.inputs) &&
         JSON.stringify(a.fields) === JSON.stringify(b.fields)
}

function diffBlockFields(base: IntermediateBlock, newBlock: IntermediateBlock): FieldChange[] {
  const changes: FieldChange[] = []
  const allFields = new Set([...Object.keys(base.inputs), ...Object.keys(newBlock.inputs),
    ...Object.keys(base.fields), ...Object.keys(newBlock.fields)])
  
  for (const field of allFields) {
    const baseVal = base.inputs[field] ?? base.fields[field]
    const newVal = newBlock.inputs[field] ?? newBlock.fields[field]
    if (JSON.stringify(baseVal) !== JSON.stringify(newVal)) {
      changes.push({ field, oldValue: baseVal, newValue: newVal })
    }
  }
  
  if (base.opcode !== newBlock.opcode) {
    changes.push({ field: 'opcode', oldValue: base.opcode, newValue: newBlock.opcode })
  }
  if (base.next !== newBlock.next) {
    changes.push({ field: 'next', oldValue: base.next, newValue: newBlock.next })
  }
  if (base.parent !== newBlock.parent) {
    changes.push({ field: 'parent', oldValue: base.parent, newValue: newBlock.parent })
  }
  if (base.shadow !== newBlock.shadow) {
    changes.push({ field: 'shadow', oldValue: base.shadow, newValue: newBlock.shadow })
  }
  if (base.x !== newBlock.x || base.y !== newBlock.y) {
    changes.push({ field: 'position', oldValue: { x: base.x, y: base.y }, newValue: { x: newBlock.x, y: newBlock.y } })
  }
  
  return changes
}

function diffComments(base: IntermediateComment[], newComments: IntermediateComment[]): CommentDiff[] {
  const result: CommentDiff[] = []
  const baseMap = new Map(base.map(c => [c.id, c]))
  const newMap = new Map(newComments.map(c => [c.id, c]))
  const allIds = new Set([...baseMap.keys(), ...newMap.keys()])
  
  for (const id of allIds) {
    const baseComment = baseMap.get(id)
    const newComment = newMap.get(id)
    
    if (baseComment && newComment) {
      if (baseComment.text === newComment.text && baseComment.x === newComment.x && baseComment.y === newComment.y) {
        result.push({ id, type: 'unchanged' })
      } else {
        result.push({ 
          id, 
          type: 'modified', 
          oldComment: { text: baseComment.text, x: baseComment.x, y: baseComment.y },
          newComment: { text: newComment.text, x: newComment.x, y: newComment.y }
        })
      }
    } else if (baseComment && !newComment) {
      result.push({ id, type: 'removed', oldComment: { text: baseComment.text, x: baseComment.x, y: baseComment.y } })
    } else if (!baseComment && newComment) {
      result.push({ id, type: 'added', newComment: { text: newComment.text, x: newComment.x, y: newComment.y } })
    }
  }
  
  return result
}

function diffAssets<T extends { semanticId: string; name: string; md5ext?: string }>(
  base: T[], 
  newAssets: T[]
): AssetDiff[] {
  const result: AssetDiff[] = []
  const baseMap = new Map(base.map(a => [a.semanticId, a]))
  const newMap = new Map(newAssets.map(a => [a.semanticId, a]))
  const allIds = new Set([...baseMap.keys(), ...newMap.keys()])
  
  for (const id of allIds) {
    const baseAsset = baseMap.get(id)
    const newAsset = newMap.get(id)
    
    if (baseAsset && newAsset) {
      if (baseAsset.md5ext === newAsset.md5ext) {
        result.push({ semanticId: id, name: newAsset.name, type: 'unchanged' })
      } else {
        result.push({ semanticId: id, name: newAsset.name, type: 'modified', oldMd5: baseAsset.md5ext, newMd5: newAsset.md5ext })
      }
    } else if (baseAsset && !newAsset) {
      result.push({ semanticId: id, name: baseAsset.name, type: 'removed' })
    } else if (!baseAsset && newAsset) {
      result.push({ semanticId: id, name: newAsset.name, type: 'added' })
    }
  }
  
  return result
}

function diffTargetProperties(base: IntermediateTarget, newTarget: IntermediateTarget): PropertyDiff[] {
  const changes: PropertyDiff[] = []
  const props = ['currentCostume', 'volume', 'layerOrder', 'tempo', 'videoTransparency', 'videoState', 'textToSpeechLanguage', 'x', 'y', 'size', 'direction', 'draggable', 'rotationStyle', 'visible'] as const
  
  for (const prop of props) {
    const baseVal = base[prop]
    const newVal = newTarget[prop]
    if (JSON.stringify(baseVal) !== JSON.stringify(newVal)) {
      changes.push({ property: prop, oldValue: baseVal, newValue: newVal })
    }
  }
  
  return changes
}

function diffMonitors(base: IntermediateMonitor[], newMonitors: IntermediateMonitor[]): MonitorDiff[] {
  const result: MonitorDiff[] = []
  const baseMap = new Map(base.map(m => [m.semanticId, m]))
  const newMap = new Map(newMonitors.map(m => [m.semanticId, m]))
  const allIds = new Set([...baseMap.keys(), ...newMap.keys()])
  
  for (const id of allIds) {
    const baseMonitor = baseMap.get(id)
    const newMonitor = newMap.get(id)
    
    if (baseMonitor && newMonitor) {
      const changes = diffBlockFields(baseMonitor as unknown as IntermediateBlock, newMonitor as unknown as IntermediateBlock)
      if (changes.length === 0) {
        result.push({ semanticId: id, type: 'unchanged' })
      } else {
        result.push({ semanticId: id, type: 'modified', changes })
      }
    } else if (baseMonitor && !newMonitor) {
      result.push({ semanticId: id, type: 'removed' })
    } else if (!baseMonitor && newMonitor) {
      result.push({ semanticId: id, type: 'added' })
    }
  }
  
  return result
}

function diffExtensions(base: IntermediateExtension[], newExtensions: IntermediateExtension[]): ExtensionDiff[] {
  const result: ExtensionDiff[] = []
  const baseMap = new Map(base.map(e => [e.name, e]))
  const newMap = new Map(newExtensions.map(e => [e.name, e]))
  const allNames = new Set([...baseMap.keys(), ...newMap.keys()])
  
  for (const name of allNames) {
    const baseExt = baseMap.get(name)
    const newExt = newMap.get(name)
    
    if (baseExt && newExt) {
      if (baseExt.version === newExt.version) {
        result.push({ name, type: 'unchanged' })
      } else {
        result.push({ name, type: 'modified', oldVersion: baseExt.version, newVersion: newExt.version })
      }
    } else if (baseExt && !newExt) {
      result.push({ name, type: 'removed' })
    } else if (!baseExt && newExt) {
      result.push({ name, type: 'added', newVersion: newExt.version })
    }
  }
  
  return result
}
