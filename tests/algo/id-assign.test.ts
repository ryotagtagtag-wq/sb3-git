import { describe, it, expect } from 'vitest'
import { assignSemanticIds, computeBlockContentHash } from '../../src/algo/id-assign.js'
import { normalize } from '../../src/codec/normalize.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const sampleProjectPath = join(__dirname, '..', 'fixtures', 'sample-project.json')

describe('ID Assignment', () => {
  let baseProject: any
  
  beforeAll(async () => {
    const json = await readFile(sampleProjectPath, 'utf-8')
    baseProject = JSON.parse(json)
  })
  
  function prepareProject(project: any) {
    return normalize(project)
  }
  
  it('should assign semantic IDs based on position', () => {
    const normalized = prepareProject(baseProject)
    const result = assignSemanticIds(normalized)
    
    // Check target semantic IDs
    expect(result.targets[0].semanticId).toBe('target_0_stage')
    expect(result.targets[1].semanticId).toBe('target_1_sprite1')
    
    // Check script semantic IDs
    const script = result.targets[0].scripts[0]
    expect(script.semanticId).toBe('script_0_0')
    
    // Check block semantic IDs
    const blocks = script.blocks
    expect(blocks[0].semanticId).toBe('script_0_0_block_0')
    expect(blocks[1].semanticId).toBe('script_0_0_block_1')
  })
  
  it('should compute stable content hash', () => {
    const block1 = {
      opcode: 'motion_movesteps',
      next: null,
      parent: 'block1',
      inputs: { STEPS: [1, [10]] },
      fields: {},
      shadow: false,
      topLevel: false
    }
    
    const block2 = {
      opcode: 'motion_movesteps',
      next: null,
      parent: 'block1',
      inputs: { STEPS: [1, [10]] },
      fields: {},
      shadow: false,
      topLevel: false
    }
    
    const hash1 = computeBlockContentHash(block1)
    const hash2 = computeBlockContentHash(block2)
    
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(16)
  })
  
  it('should produce different hashes for different blocks', () => {
    const block1 = {
      opcode: 'motion_movesteps',
      next: null,
      parent: 'block1',
      inputs: { STEPS: [1, [10]] },
      fields: {},
      shadow: false,
      topLevel: false
    }
    
    const block2 = {
      opcode: 'motion_movesteps',
      next: null,
      parent: 'block1',
      inputs: { STEPS: [1, [20]] }, // Different value
      fields: {},
      shadow: false,
      topLevel: false
    }
    
    const hash1 = computeBlockContentHash(block1)
    const hash2 = computeBlockContentHash(block2)
    
    expect(hash1).not.toBe(hash2)
  })
})
