// Semantic ID assignment with topological sort
import { createHash } from 'node:crypto'
import type { IntermediateProject, IntermediateTarget, IntermediateScript, IntermediateBlock } from '../codec/types.js'

export function assignSemanticIds(project: IntermediateProject): IntermediateProject {
  // Deep clone to avoid mutation
  const cloned = JSON.parse(JSON.stringify(project)) as IntermediateProject
  
  for (let targetIndex = 0; targetIndex < cloned.targets.length; targetIndex++) {
    const target = cloned.targets[targetIndex]
    if (!target) continue
    target.semanticId = `target_${targetIndex}_${sanitize(target.name)}`
    
    for (let scriptIndex = 0; scriptIndex < target.scripts.length; scriptIndex++) {
      const script = target.scripts[scriptIndex]
      if (!script) continue
      script.semanticId = `script_${targetIndex}_${scriptIndex}`
      
      for (let blockIndex = 0; blockIndex < script.blocks.length; blockIndex++) {
        const block = script.blocks[blockIndex]
        if (!block) continue
        block.semanticId = `script_${targetIndex}_${scriptIndex}_block_${blockIndex}`
      }
    }
    
    // Assign semantic IDs to costumes and sounds
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
    
    // Assign semantic IDs to comments
    for (const comment of target.comments) {
      if (comment.blockSemanticId) {
        // Find the block with matching semantic ID
        const block = findBlockByOldId(cloned, comment.blockSemanticId)
        if (block) {
          comment.blockSemanticId = block.semanticId
        }
      }
    }
  }
  
  // Monitors
  for (let i = 0; i < cloned.monitors.length; i++) {
    const monitor = cloned.monitors[i]
    if (monitor) {
      monitor.semanticId = `monitor_${i}`
    }
  }
  
  return cloned
}

function findBlockByOldId(project: IntermediateProject, oldId: string): IntermediateBlock | null {
  for (const target of project.targets) {
    for (const script of target.scripts) {
      const block = script.blocks.find(b => b.id === oldId)
      if (block) return block
    }
  }
  return null
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
}

// Topological sort for block ordering
export function topologicalSortBlocks(blocks: IntermediateBlock[]): IntermediateBlock[] {
  const graph = new Map<string, Set<string>>()
  const inDegree = new Map<string, number>()
  const blockMap = new Map<string, IntermediateBlock>()
  
  // Build graph
  for (const block of blocks) {
    blockMap.set(block.semanticId, block)
    graph.set(block.semanticId, new Set())
    inDegree.set(block.semanticId, 0)
  }
  
  // Add edges: parent -> child, block -> next
  for (const block of blocks) {
    if (block.parent) {
      const parentId = block.parent
      // Find parent by old ID or semantic ID
      const parent = Array.from(blockMap.values()).find(b => b.id === parentId || b.semanticId === parentId)
      if (parent) {
        graph.get(parent.semanticId)!.add(block.semanticId)
        inDegree.set(block.semanticId, (inDegree.get(block.semanticId) || 0) + 1)
      }
    }
    if (block.next) {
      const nextId = block.next
      const next = Array.from(blockMap.values()).find(b => b.id === nextId || b.semanticId === nextId)
      if (next) {
        graph.get(block.semanticId)!.add(next.semanticId)
        inDegree.set(next.semanticId, (inDegree.get(next.semanticId) || 0) + 1)
      }
    }
  }
  
  // Kahn's algorithm
  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }
  
  const sorted: IntermediateBlock[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    const block = blockMap.get(id)!
    sorted.push(block)
    
    for (const neighbor of graph.get(id) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) queue.push(neighbor)
    }
  }
  
  return sorted
}

// Compute content hash for block matching
export function computeBlockContentHash(block: IntermediateBlock): string {
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
