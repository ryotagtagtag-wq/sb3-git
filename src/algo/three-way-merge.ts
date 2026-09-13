// Three-way merge for SB3 projects
import { createHash } from 'node:crypto'
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

export interface MergeResult {
  project: IntermediateProject
  conflicts: MergeConflict[]
}

export interface MergeConflict {
  type: 'block' | 'comment' | 'costume' | 'sound' | 'property' | 'target' | 'script'
  path: string
  base?: unknown
  ours?: unknown
  theirs?: unknown
  message: string
  autoResolved: boolean
  resolution?: 'ours' | 'theirs' | 'base' | 'merged'
}

export function threeWayMerge(
  base: IntermediateProject,
  ours: IntermediateProject,
  theirs: IntermediateProject,
  options: { autoResolve?: boolean } = {}
): MergeResult {
  const conflicts: MergeConflict[] = []
  const autoResolve = options.autoResolve ?? false
  
  // Merge targets
  const mergedTargets = mergeTargets(base.targets, ours.targets, theirs.targets, conflicts, autoResolve)
  
  // Merge monitors
  const mergedMonitors = mergeMonitors(base.monitors, ours.monitors, theirs.monitors, conflicts, autoResolve)
  
  // Merge extensions
  const mergedExtensions = mergeExtensions(base.extensions, ours.extensions, theirs.extensions, conflicts, autoResolve)
  
  // Merge meta (prefer ours)
  const mergedMeta = ours.meta
  
  const mergedProject: IntermediateProject = {
    targets: mergedTargets,
    monitors: mergedMonitors,
    extensions: mergedExtensions,
    meta: mergedMeta
  }
  
  // Reassign semantic IDs after merge
  const finalProject = reassignSemanticIds(mergedProject)
  
  return { project: finalProject, conflicts }
}

function mergeTargets(
  baseTargets: IntermediateTarget[],
  ourTargets: IntermediateTarget[],
  theirTargets: IntermediateTarget[],
  conflicts: MergeConflict[],
  autoResolve: boolean
): IntermediateTarget[] {
  const baseMap = new Map(baseTargets.map(t => [t.semanticId, t]))
  const ourMap = new Map(ourTargets.map(t => [t.semanticId, t]))
  const theirMap = new Map(theirTargets.map(t => [t.semanticId, t]))
  const allIds = new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()])
  const result: IntermediateTarget[] = []
  
  for (const id of allIds) {
    const base = baseMap.get(id)
    const ours = ourMap.get(id)
    const theirs = theirMap.get(id)
    
    if (base && ours && theirs) {
      // All three exist - merge
      result.push(mergeTarget(base, ours, theirs, conflicts, autoResolve))
    } else if (base && ours && !theirs) {
      // Only in base and ours
      result.push(ours)
    } else if (base && !ours && theirs) {
      // Only in base and theirs
      result.push(theirs)
    } else if (!base && ours && theirs) {
      // New in both ours and theirs - conflict
      const conflict: MergeConflict = {
        type: 'target',
        path: id,
        base: undefined,
        ours: ours.name,
        theirs: theirs.name,
        message: `Target added in both branches with different content: ${ours.name} vs ${theirs.name}`,
        autoResolved: false
      }
      conflicts.push(conflict)
      if (autoResolve) {
        conflict.autoResolved = true
        conflict.resolution = 'ours'
        result.push(ours)
      } else {
        result.push(ours)
      }
    } else if (base && !ours && !theirs) {
      // Deleted in both - don't include
    } else if (!base && ours && !theirs) {
      // Only in ours
      result.push(ours)
    } else if (!base && !ours && theirs) {
      // Only in theirs
      result.push(theirs)
    }
  }
  
  return result
}

function mergeTarget(
  base: IntermediateTarget,
  ours: IntermediateTarget,
  theirs: IntermediateTarget,
  conflicts: MergeConflict[],
  autoResolve: boolean
): IntermediateTarget {
  // Merge properties
  const mergedProps = mergeProperties(base, ours, theirs, `target.${base.semanticId}`, conflicts, autoResolve)
  
  // Merge scripts
  const mergedScripts = mergeScripts(base.scripts, ours.scripts, theirs.scripts, conflicts, autoResolve)
  
  // Merge comments
  const mergedComments = mergeComments(base.comments, ours.comments, theirs.comments, conflicts, autoResolve)
  
  // Merge costumes
  const mergedCostumes = mergeCostumes(base.costumes, ours.costumes, theirs.costumes, conflicts, autoResolve)
  
  // Merge sounds
  const mergedSounds = mergeSounds(base.sounds, ours.sounds, theirs.sounds, conflicts, autoResolve)
  
  const result: IntermediateTarget = {
    name: mergedProps.name ?? ours.name,
    semanticId: ours.semanticId,
    variables: mergedProps.variables ?? ours.variables,
    lists: mergedProps.lists ?? ours.lists,
    broadcasts: mergedProps.broadcasts ?? ours.broadcasts,
    scripts: mergedScripts,
    comments: mergedComments,
    costumes: mergedCostumes,
    sounds: mergedSounds,
    currentCostume: mergedProps.currentCostume ?? ours.currentCostume,
    volume: mergedProps.volume ?? ours.volume,
    layerOrder: mergedProps.layerOrder ?? ours.layerOrder,
    tempo: mergedProps.tempo ?? ours.tempo,
    videoTransparency: mergedProps.videoTransparency ?? ours.videoTransparency,
    videoState: mergedProps.videoState ?? ours.videoState,
    textToSpeechLanguage: (mergedProps.textToSpeechLanguage as string | null) ?? ours.textToSpeechLanguage,
    x: mergedProps.x ?? ours.x,
    y: mergedProps.y ?? ours.y,
    size: mergedProps.size ?? ours.size,
    direction: mergedProps.direction ?? ours.direction,
    draggable: mergedProps.draggable ?? ours.draggable,
    rotationStyle: mergedProps.rotationStyle ?? ours.rotationStyle,
    visible: mergedProps.visible ?? ours.visible
  }
  
  return result
}

function mergeProperties(
  base: IntermediateTarget,
  ours: IntermediateTarget,
  theirs: IntermediateTarget,
  path: string,
  conflicts: MergeConflict[],
  autoResolve: boolean
): Partial<IntermediateTarget> {
  const result: Partial<IntermediateTarget> = {}
  const props: (keyof IntermediateTarget)[] = ['name', 'variables', 'lists', 'broadcasts', 'currentCostume', 'volume', 'layerOrder', 'tempo', 'videoTransparency', 'videoState', 'textToSpeechLanguage', 'x', 'y', 'size', 'direction', 'draggable', 'rotationStyle', 'visible']
  
  for (const prop of props) {
    const baseVal = base[prop]
    const ourVal = ours[prop]
    const theirVal = theirs[prop]
    
    const merged = mergeProperty(baseVal, ourVal, theirVal, `${path}.${String(prop)}`, conflicts, autoResolve)
    if (merged !== undefined) {
      // Use type assertion to handle the union type properly
      (result as Record<string, unknown>)[prop] = merged
    }
  }
  
  return result
}

function mergeProperty(
  base: unknown,
  ours: unknown,
  theirs: unknown,
  path: string,
  conflicts: MergeConflict[],
  autoResolve: boolean
): unknown {
  const baseStr = JSON.stringify(base)
  const ourStr = JSON.stringify(ours)
  const theirStr = JSON.stringify(theirs)
  
  if (ourStr === theirStr) {
    return ours // Both changed to same value
  }
  if (ourStr === baseStr) {
    return theirs // Only theirs changed
  }
  if (theirStr === baseStr) {
    return ours // Only ours changed
  }
  // Both changed differently - conflict
  const conflict: MergeConflict = {
    type: 'property',
    path,
    base,
    ours,
    theirs,
    message: `Property conflict at ${path}: ours=${ourStr}, theirs=${theirStr}`,
    autoResolved: false
  }
  conflicts.push(conflict)
  
  if (autoResolve) {
    conflict.autoResolved = true
    conflict.resolution = 'ours'
    return ours
  }
  return ours // Default to ours
}

function mergeScripts(
  baseScripts: IntermediateScript[],
  ourScripts: IntermediateScript[],
  theirScripts: IntermediateScript[],
  conflicts: MergeConflict[],
  autoResolve: boolean
): IntermediateScript[] {
  const baseMap = new Map(baseScripts.map(s => [s.semanticId, s]))
  const ourMap = new Map(ourScripts.map(s => [s.semanticId, s]))
  const theirMap = new Map(theirScripts.map(s => [s.semanticId, s]))
  const allIds = new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()])
  const result: IntermediateScript[] = []
  
  for (const id of allIds) {
    const base = baseMap.get(id)
    const ours = ourMap.get(id)
    const theirs = theirMap.get(id)
    
    if (base && ours && theirs) {
      const mergedScript = mergeScript(base, ours, theirs, conflicts, autoResolve)
      if (mergedScript) result.push(mergedScript)
    } else if (base && ours && !theirs) {
      result.push(ours)
    } else if (base && !ours && theirs) {
      result.push(theirs)
    } else if (!base && ours && theirs) {
      // New in both
      const conflict: MergeConflict = {
        type: 'script',
        path: id,
        base: undefined,
        ours: ours.semanticId,
        theirs: theirs.semanticId,
        message: `Script added in both branches: ${id}`,
        autoResolved: false
      }
      conflicts.push(conflict)
      if (autoResolve) {
        conflict.autoResolved = true
        conflict.resolution = 'ours'
        result.push(ours)
      } else {
        result.push(ours)
      }
    } else if (!base && ours && !theirs) {
      result.push(ours)
    } else if (!base && !ours && theirs) {
      result.push(theirs)
    }
    // If base only (deleted in both), don't include
  }
  
  return result
}

function mergeScript(
  base: IntermediateScript,
  ours: IntermediateScript,
  theirs: IntermediateScript,
  conflicts: MergeConflict[],
  autoResolve: boolean
): IntermediateScript {
  const mergedBlocks = mergeBlocks(base.blocks, ours.blocks, theirs.blocks, conflicts, autoResolve)
  return {
    semanticId: base.semanticId,
    blocks: mergedBlocks
  }
}

function mergeBlocks(
  baseBlocks: IntermediateBlock[],
  ourBlocks: IntermediateBlock[],
  theirBlocks: IntermediateBlock[],
  conflicts: MergeConflict[],
  autoResolve: boolean
): IntermediateBlock[] {
  const baseMap = new Map(baseBlocks.map(b => [b.semanticId, b]))
  const ourMap = new Map(ourBlocks.map(b => [b.semanticId, b]))
  const theirMap = new Map(theirBlocks.map(b => [b.semanticId, b]))
  const allIds = new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()])
  const result: IntermediateBlock[] = []
  
  for (const id of allIds) {
    const base = baseMap.get(id)
    const ours = ourMap.get(id)
    const theirs = theirMap.get(id)
    
    if (base && ours && theirs) {
      const merged = mergeBlock(base, ours, theirs, conflicts, autoResolve)
      if (merged) result.push(merged)
    } else if (base && ours && !theirs) {
      result.push(ours)
    } else if (base && !ours && theirs) {
      result.push(theirs)
    } else if (!base && ours && theirs) {
      // New block in both - conflict
      const conflict: MergeConflict = {
        type: 'block',
        path: id,
        base: undefined,
        ours: ours.opcode,
        theirs: theirs.opcode,
        message: `Block added in both branches with different opcodes: ${ours.opcode} vs ${theirs.opcode}`,
        autoResolved: false
      }
      conflicts.push(conflict)
      if (autoResolve) {
        conflict.autoResolved = true
        conflict.resolution = 'ours'
        result.push(ours)
      } else {
        result.push(ours)
      }
    } else if (!base && ours && !theirs) {
      result.push(ours)
    } else if (!base && !ours && theirs) {
      result.push(theirs)
    }
    // If base only (deleted in both), don't include
  }
  
  return result
}

function mergeBlock(
  base: IntermediateBlock,
  ours: IntermediateBlock,
  theirs: IntermediateBlock,
  conflicts: MergeConflict[],
  autoResolve: boolean
): IntermediateBlock | null {
  const baseHash = computeBlockContentHash(base)
  const ourHash = computeBlockContentHash(ours)
  const theirHash = computeBlockContentHash(theirs)
  
  if (ourHash === theirHash) {
    // Both changed to same thing
    return ours
  }
  if (ourHash === baseHash) {
    // Only theirs changed
    return theirs
  }
  if (theirHash === baseHash) {
    // Only ours changed
    return ours
  }
  // Both changed differently - conflict
  const conflict: MergeConflict = {
    type: 'block',
    path: base.semanticId,
    base: { opcode: base.opcode, inputs: base.inputs, fields: base.fields },
    ours: { opcode: ours.opcode, inputs: ours.inputs, fields: ours.fields },
    theirs: { opcode: theirs.opcode, inputs: theirs.inputs, fields: theirs.fields },
    message: `Block modified in both branches: ${base.semanticId}`,
    autoResolved: false
  }
  conflicts.push(conflict)
  
  if (autoResolve) {
    conflict.autoResolved = true
    conflict.resolution = 'ours'
    return ours
  }
  return ours // Default to ours
}

function mergeComments(
  base: IntermediateComment[],
  ours: IntermediateComment[],
  theirs: IntermediateComment[],
  conflicts: MergeConflict[],
  autoResolve: boolean
): IntermediateComment[] {
  const baseMap = new Map(base.map(c => [c.id, c]))
  const ourMap = new Map(ours.map(c => [c.id, c]))
  const theirMap = new Map(theirs.map(c => [c.id, c]))
  const allIds = new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()])
  const result: IntermediateComment[] = []
  
  for (const id of allIds) {
    const baseComment = baseMap.get(id)
    const ourComment = ourMap.get(id)
    const theirComment = theirMap.get(id)
    
    if (baseComment && ourComment && theirComment) {
      const merged = mergeComment(baseComment, ourComment, theirComment, conflicts, autoResolve)
      if (merged) result.push(merged)
    } else if (baseComment && ourComment && !theirComment) {
      result.push(ourComment)
    } else if (baseComment && !ourComment && theirComment) {
      result.push(theirComment)
    } else if (!baseComment && ourComment && theirComment) {
      // New in both
      const conflict: MergeConflict = {
        type: 'comment',
        path: id,
        base: undefined,
        ours: ourComment.text,
        theirs: theirComment.text,
        message: `Comment added in both branches: ${id}`,
        autoResolved: false
      }
      conflicts.push(conflict)
      if (autoResolve) {
        conflict.autoResolved = true
        conflict.resolution = 'ours'
        result.push(ourComment)
      } else {
        result.push(ourComment)
      }
    } else if (!baseComment && ourComment && !theirComment) {
      result.push(ourComment)
    } else if (!baseComment && !ourComment && theirComment) {
      result.push(theirComment)
    }
  }
  
  return result
}

function mergeComment(
  base: IntermediateComment,
  ours: IntermediateComment,
  theirs: IntermediateComment,
  conflicts: MergeConflict[],
  autoResolve: boolean
): IntermediateComment | null {
  const baseStr = JSON.stringify({ text: base.text, x: base.x, y: base.y })
  const ourStr = JSON.stringify({ text: ours.text, x: ours.x, y: ours.y })
  const theirStr = JSON.stringify({ text: theirs.text, x: theirs.x, y: theirs.y })
  
  if (ourStr === theirStr) return ours
  if (ourStr === baseStr) return theirs
  if (theirStr === baseStr) return ours
  
  const conflict: MergeConflict = {
    type: 'comment',
    path: base.id,
    base: { text: base.text, x: base.x, y: base.y },
    ours: { text: ours.text, x: ours.x, y: ours.y },
    theirs: { text: theirs.text, x: theirs.x, y: theirs.y },
    message: `Comment modified in both branches: ${base.id}`,
    autoResolved: false
  }
  conflicts.push(conflict)
  
  if (autoResolve) {
    conflict.autoResolved = true
    conflict.resolution = 'ours'
    return ours
  }
  return ours
}

function mergeCostumes(
  base: IntermediateCostume[],
  ours: IntermediateCostume[],
  theirs: IntermediateCostume[],
  conflicts: MergeConflict[],
  autoResolve: boolean
): IntermediateCostume[] {
  return mergeAssets(base, ours, theirs, 'costume', conflicts, autoResolve)
}

function mergeSounds(
  base: IntermediateSound[],
  ours: IntermediateSound[],
  theirs: IntermediateSound[],
  conflicts: MergeConflict[],
  autoResolve: boolean
): IntermediateSound[] {
  return mergeAssets(base, ours, theirs, 'sound', conflicts, autoResolve)
}

function mergeAssets<T extends { semanticId: string; md5ext?: string }>(
  base: T[],
  ours: T[],
  theirs: T[],
  type: 'costume' | 'sound',
  conflicts: MergeConflict[],
  autoResolve: boolean
): T[] {
  const baseMap = new Map(base.map(a => [a.semanticId, a]))
  const ourMap = new Map(ours.map(a => [a.semanticId, a]))
  const theirMap = new Map(theirs.map(a => [a.semanticId, a]))
  const allIds = new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()])
  const result: T[] = []
  
  for (const id of allIds) {
    const baseAsset = baseMap.get(id)
    const ourAsset = ourMap.get(id)
    const theirAsset = theirMap.get(id)
    
    if (baseAsset && ourAsset && theirAsset) {
      if (ourAsset.md5ext === theirAsset.md5ext) {
        result.push(ourAsset)
      } else if (ourAsset.md5ext === baseAsset.md5ext) {
        result.push(theirAsset)
      } else if (theirAsset.md5ext === baseAsset.md5ext) {
        result.push(ourAsset)
      } else {
        // Conflict: both modified the asset
        const conflict: MergeConflict = {
          type,
          path: id,
          base: baseAsset.md5ext,
          ours: ourAsset.md5ext,
          theirs: theirAsset.md5ext,
          message: `${type} modified in both branches: ${id}`,
          autoResolved: false
        }
        conflicts.push(conflict)
        if (autoResolve) {
          conflict.autoResolved = true
          conflict.resolution = 'ours'
          result.push(ourAsset)
        } else {
          result.push(ourAsset)
        }
      }
    } else if (baseAsset && ourAsset && !theirAsset) {
      result.push(ourAsset)
    } else if (baseAsset && !ourAsset && theirAsset) {
      result.push(theirAsset)
    } else if (!baseAsset && ourAsset && theirAsset) {
      // New in both
      const conflict: MergeConflict = {
        type,
        path: id,
        base: undefined,
        ours: ourAsset.md5ext,
        theirs: theirAsset.md5ext,
        message: `${type} added in both branches: ${id}`,
        autoResolved: false
      }
      conflicts.push(conflict)
      if (autoResolve) {
        conflict.autoResolved = true
        conflict.resolution = 'ours'
        result.push(ourAsset)
      } else {
        result.push(ourAsset)
      }
    } else if (!baseAsset && ourAsset && !theirAsset) {
      result.push(ourAsset)
    } else if (!baseAsset && !ourAsset && theirAsset) {
      result.push(theirAsset)
    }
  }
  
  return result
}

function mergeMonitors(
  base: IntermediateMonitor[],
  ours: IntermediateMonitor[],
  theirs: IntermediateMonitor[],
  conflicts: MergeConflict[],
  autoResolve: boolean
): IntermediateMonitor[] {
  const baseMap = new Map(base.map(m => [m.semanticId, m]))
  const ourMap = new Map(ours.map(m => [m.semanticId, m]))
  const theirMap = new Map(theirs.map(m => [m.semanticId, m]))
  const allIds = new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()])
  const result: IntermediateMonitor[] = []
  
  for (const id of allIds) {
    const baseMon = baseMap.get(id)
    const ourMon = ourMap.get(id)
    const theirMon = theirMap.get(id)
    
    if (baseMon && ourMon && theirMon) {
      // Simple property merge for monitors
      result.push({
        ...ourMon,
        ...theirMon,
      })
    } else if (baseMon && ourMon && !theirMon) {
      result.push(ourMon)
    } else if (baseMon && !ourMon && theirMon) {
      result.push(theirMon)
    } else if (!baseMon && ourMon && theirMon) {
      result.push(ourMon) // default to ours
    } else if (!baseMon && ourMon && !theirMon) {
      result.push(ourMon)
    } else if (!baseMon && !ourMon && theirMon) {
      result.push(theirMon)
    }
  }
  
  return result
}

function mergeExtensions(
  base: IntermediateExtension[],
  ours: IntermediateExtension[],
  theirs: IntermediateExtension[],
  conflicts: MergeConflict[],
  autoResolve: boolean
): IntermediateExtension[] {
  const baseMap = new Map(base.map(e => [e.name, e]))
  const ourMap = new Map(ours.map(e => [e.name, e]))
  const theirMap = new Map(theirs.map(e => [e.name, e]))
  const allNames = new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()])
  const result: IntermediateExtension[] = []
  
  for (const name of allNames) {
    const baseExt = baseMap.get(name)
    const ourExt = ourMap.get(name)
    const theirExt = theirMap.get(name)
    
    if (baseExt && ourExt && theirExt) {
      if (ourExt.version === theirExt.version) {
        result.push(ourExt)
      } else if (ourExt.version === baseExt.version) {
        result.push(theirExt)
      } else if (theirExt.version === baseExt.version) {
        result.push(ourExt)
      } else {
        const conflict: MergeConflict = {
          type: 'property',
          path: `extension.${name}`,
          base: baseExt.version,
          ours: ourExt.version,
          theirs: theirExt.version,
          message: `Extension version conflict: ${name}`,
          autoResolved: false
        }
        conflicts.push(conflict)
        if (autoResolve) {
          conflict.autoResolved = true
          conflict.resolution = 'ours'
          result.push(ourExt)
        } else {
          result.push(ourExt)
        }
      }
    } else if (ourExt && !theirExt) {
      result.push(ourExt)
    } else if (!ourExt && theirExt) {
      result.push(theirExt)
    }
    // If base only, don't include (removed in both)
  }
  
  return result
}

function reassignSemanticIds(project: IntermediateProject): IntermediateProject {
  const cloned = JSON.parse(JSON.stringify(project)) as IntermediateProject
  let targetIndex = 0
  
  for (const target of cloned.targets) {
    target.semanticId = `target_${targetIndex}_${sanitize(target.name)}`
    
    for (let scriptIndex = 0; scriptIndex < target.scripts.length; scriptIndex++) {
      const script = target.scripts[scriptIndex]
      if (!script) continue
      script.semanticId = `script_${targetIndex}_${scriptIndex}`
      
      for (let blockIndex = 0; blockIndex < script.blocks.length; blockIndex++) {
        const block = script.blocks[blockIndex]
        if (block) {
          block.semanticId = `script_${targetIndex}_${scriptIndex}_block_${blockIndex}`
        }
      }
    }
    
    for (let i = 0; i < target.costumes.length; i++) {
      const costume = target.costumes[i]
      if (costume) {
        costume.semanticId = `costume_${targetIndex}_${i}_${sanitize(costume.name)}`
      }
    }
    for (let i = 0; i < target.sounds.length; i++) {
      const sound = target.sounds[i]
      if (sound) {
        sound.semanticId = `sound_${targetIndex}_${i}_${sanitize(sound.name)}`
      }
    }
    
    // Update comment references - use explicit type guard with proper regex match handling
    for (const comment of target.comments) {
      const blockSemanticId = comment.blockSemanticId
      // Explicit check for string type (field is string | null)
      if (blockSemanticId !== null && blockSemanticId !== undefined) {
        const match = blockSemanticId.match(/script_(\d+)_(\d+)_block_(\d+)/)
        if (match) {
          const tIdx = match[1]
          const sIdx = match[2]
          const bIdx = match[3]
          // Use non-null assertion since we checked the match exists
          if (parseInt(tIdx!, 10) === targetIndex) {
            comment.blockSemanticId = `script_${targetIndex}_${sIdx!}_block_${bIdx!}`
          }
        }
      }
    }
    
    targetIndex++
  }
  
  for (let i = 0; i < cloned.monitors.length; i++) {
    const monitor = cloned.monitors[i]
    if (monitor) {
      monitor.semanticId = `monitor_${i}`
    }
  }
  
  return cloned
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
}

function computeBlockContentHash(block: IntermediateBlock): string {
  const hash = createHash('sha256')
  hash.update(block.opcode)
  for (const [key, input] of Object.entries(block.inputs).sort()) {
    hash.update(key)
    hash.update(String(input[0]))
    if (typeof input[1] !== 'object' || input[1] === null || Array.isArray(input[1])) {
      hash.update(JSON.stringify(input[1]))
    }
  }
  for (const [key, field] of Object.entries(block.fields).sort()) {
    hash.update(key)
    hash.update(field[0])
    hash.update(field[1])
  }
  hash.update(String(block.shadow))
  return hash.digest('hex').slice(0, 16)
}
