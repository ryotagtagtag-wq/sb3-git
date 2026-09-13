// Deterministic normalization: sorted keys, semantic IDs, stripped meta
import { createHash } from 'node:crypto'
import type { SB3Project, SB3Target, SB3Block, SB3Input, SB3Comment, SB3Costume, SB3Sound, SB3Monitor, SB3Extension, SB3Meta } from './types.js'
import type { IntermediateProject, IntermediateTarget, IntermediateBlock, IntermediateScript, IntermediateComment, IntermediateCostume, IntermediateSound, IntermediateMonitor, IntermediateExtension, IntermediateMeta, IntermediateInput, IntermediateInputValue } from './types.js'

export function normalize(project: SB3Project): IntermediateProject {
  // Sort targets by layerOrder (deterministic)
  const sortedTargets = [...project.targets].sort((a, b) => a.layerOrder - b.layerOrder)
  
  return {
    targets: sortedTargets.map(normalizeTarget),
    monitors: project.monitors.map(normalizeMonitor),
    extensions: project.extensions.map(normalizeExtension),
    meta: normalizeMeta(project.meta)
  }
}

function normalizeTarget(target: SB3Target): IntermediateTarget {
  // Convert flat blocks to scripts with semantic IDs
  const scripts = extractScripts(target.blocks)
  
  return {
    name: target.name,
    semanticId: `target_${target.name.replace(/\s+/g, '_').toLowerCase()}`,
    variables: Object.fromEntries(
      Object.entries(target.variables).sort(([a], [b]) => a.localeCompare(b))
    ),
    lists: Object.fromEntries(
      Object.entries(target.lists).sort(([a], [b]) => a.localeCompare(b))
    ),
    broadcasts: Object.fromEntries(
      Object.entries(target.broadcasts).sort(([a], [b]) => a.localeCompare(b))
    ),
    scripts: scripts.map(assignSemanticIds),
    comments: Object.entries(target.comments)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, comment]) => normalizeComment(id, comment)),
    costumes: target.costumes.map((c, i) => normalizeCostume(c, i)),
    sounds: target.sounds.map((s, i) => normalizeSound(s, i)),
    currentCostume: target.currentCostume,
    volume: target.volume,
    layerOrder: target.layerOrder,
    tempo: target.tempo,
    videoTransparency: target.videoTransparency,
    videoState: target.videoState,
    textToSpeechLanguage: target.textToSpeechLanguage,
    x: target.x,
    y: target.y,
    size: target.size,
    direction: target.direction,
    draggable: target.draggable,
    rotationStyle: target.rotationStyle,
    visible: target.visible
  }
}

function extractScripts(blocks: Record<string, SB3Block>): IntermediateScript[] {
  const visited = new Set<string>()
  const scripts: IntermediateScript[] = []
  
  // Find top-level blocks
  const topLevelEntries = Object.entries(blocks)
    .filter(([, block]) => block.topLevel)
    .sort(([a, blockA], [b, blockB]) => {
      // Sort by position: top-to-bottom, left-to-right
      const yA = blockA.y ?? 0
      const yB = blockB.y ?? 0
      if (yA !== yB) return yA - yB
      const xA = blockA.x ?? 0
      const xB = blockB.x ?? 0
      return xA - xB
    })
  
  for (const [id, block] of topLevelEntries) {
    if (!visited.has(id)) {
      const scriptBlocks: IntermediateBlock[] = []
      traverseScript(id, block, blocks, visited, scriptBlocks)
      if (scriptBlocks.length > 0) {
        scripts.push({ blocks: scriptBlocks, semanticId: '' })
      }
    }
  }
  
  return scripts
}

function traverseScript(
  id: string,
  block: SB3Block,
  allBlocks: Record<string, SB3Block>,
  visited: Set<string>,
  output: IntermediateBlock[]
): void {
  if (visited.has(id)) return
  visited.add(id)
  
  const intermediateBlock = normalizeBlock(id, block)
  output.push(intermediateBlock)
  
  // Traverse inputs for nested blocks
  for (const input of Object.values(block.inputs)) {
    const inputValue = input[1]
    if (typeof inputValue === 'object' && inputValue !== null && !Array.isArray(inputValue)) {
      if ('opcode' in inputValue) {
        // Nested block (reporter/boolean)
        const nestedId = Object.keys(allBlocks).find(k => allBlocks[k] === inputValue)
        if (nestedId && !visited.has(nestedId)) {
          traverseScript(nestedId, inputValue as SB3Block, allBlocks, visited, output)
        }
      }
    } else if (Array.isArray(inputValue)) {
      // Array of blocks (e.g., in control blocks)
      for (const item of inputValue) {
        if (item && typeof item === 'object' && 'opcode' in item) {
          const nestedId = Object.keys(allBlocks).find(k => allBlocks[k] === item)
          if (nestedId && !visited.has(nestedId)) {
            traverseScript(nestedId, item as SB3Block, allBlocks, visited, output)
          }
        }
      }
    }
  }
  
  // Follow next pointer
  if (block.next) {
    const nextBlock = allBlocks[block.next]
    if (nextBlock && !visited.has(block.next)) {
      traverseScript(block.next, nextBlock, allBlocks, visited, output)
    }
  }
}

function normalizeBlock(id: string, block: SB3Block): IntermediateBlock {
  return {
    id,
    semanticId: '', // Will be assigned later
    opcode: block.opcode,
    next: block.next,
    parent: block.parent,
    inputs: normalizeInputs(block.inputs),
    fields: Object.fromEntries(
      Object.entries(block.fields).sort(([a], [b]) => a.localeCompare(b))
    ),
    shadow: block.shadow,
    topLevel: block.topLevel,
    x: block.x,
    y: block.y,
    contentHash: computeBlockContentHash(block)
  }
}

function normalizeInputs(inputs: Record<string, SB3Input>): Record<string, IntermediateInput> {
  const result: Record<string, IntermediateInput> = {}
  for (const [key, value] of Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))) {
    result[key] = [value[0], normalizeInputValue(value[1]) as IntermediateInputValue]
  }
  return result
}

function normalizeInputValue(value: unknown): IntermediateInputValue {
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map(normalizeInputValue) as IntermediateInputValue
    }
    if ('opcode' in value) {
      // This is a nested block reference - will be resolved by semantic ID
      return '[BLOCK_REF]' as IntermediateInputValue
    }
  }
  return value as IntermediateInputValue
}

function computeBlockContentHash(block: SB3Block): string {
  const hash = createHash('sha256')
  // Hash opcode, inputs (without block refs), fields, shadow
  hash.update(block.opcode)
  for (const [key, input] of Object.entries(block.inputs).sort()) {
    hash.update(key)
    hash.update(String(input[0]))
    // Don't hash block references for content hash
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

function assignSemanticIds(script: IntermediateScript, scriptIndex: number): IntermediateScript {
  let blockIndex = 0
  const semanticId = `script_${scriptIndex}_block_${blockIndex}`
  
  for (const block of script.blocks) {
    block.semanticId = `script_${scriptIndex}_block_${blockIndex}`
    blockIndex++
  }
  
  return { ...script, semanticId }
}

function normalizeComment(id: string, comment: SB3Comment): IntermediateComment {
  return {
    id,
    blockSemanticId: comment.blockId, // Will be mapped to semantic ID later
    x: comment.x,
    y: comment.y,
    width: comment.width,
    height: comment.height,
    minimized: comment.minimized,
    text: comment.text
  }
}

function normalizeCostume(costume: SB3Costume, index: number): IntermediateCostume {
  return {
    name: costume.name,
    semanticId: `costume_${index}_${costume.name.replace(/\s+/g, '_').toLowerCase()}`,
    bitmapResolution: costume.bitmapResolution,
    dataFormat: costume.dataFormat,
    assetId: costume.assetId,
    md5ext: costume.md5ext,
    rotationCenterX: costume.rotationCenterX,
    rotationCenterY: costume.rotationCenterY
  }
}

function normalizeSound(sound: SB3Sound, index: number): IntermediateSound {
  return {
    name: sound.name,
    semanticId: `sound_${index}_${sound.name.replace(/\s+/g, '_').toLowerCase()}`,
    dataFormat: sound.dataFormat,
    assetId: sound.assetId,
    md5ext: sound.md5ext,
    rate: sound.rate,
    sampleCount: sound.sampleCount
  }
}

function normalizeMonitor(monitor: SB3Monitor): IntermediateMonitor {
  return {
    id: monitor.id,
    semanticId: `monitor_${monitor.id}`,
    mode: monitor.mode,
    opcode: monitor.opcode,
    params: monitor.params,
    spriteName: monitor.spriteName,
    value: monitor.value,
    width: monitor.width,
    height: monitor.height,
    x: monitor.x,
    y: monitor.y,
    visible: monitor.visible,
    sliderMin: monitor.sliderMin,
    sliderMax: monitor.sliderMax,
    isDiscrete: monitor.isDiscrete
  }
}

function normalizeExtension(ext: SB3Extension): IntermediateExtension {
  return {
    name: ext.name,
    version: ext.version
  }
}

function normalizeMeta(meta: SB3Meta): IntermediateMeta {
  return {
    semver: meta.semver,
    vm: meta.vm,
    agent: meta.agent
  }
}
