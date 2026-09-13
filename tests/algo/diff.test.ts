import { describe, it, expect } from 'vitest'
import { diffProjects } from '../../src/algo/diff.js'
import { normalize } from '../../src/codec/normalize.js'
import { assignSemanticIds } from '../../src/algo/id-assign.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const sampleProjectPath = join(__dirname, '..', 'fixtures', 'sample-project.json')

describe('Diff Algorithm', () => {
  let baseProject: any
  
  beforeAll(async () => {
    const json = await readFile(sampleProjectPath, 'utf-8')
    baseProject = JSON.parse(json)
  })
  
  function prepareProject(project: any) {
    return assignSemanticIds(normalize(project))
  }
  
  it('should detect no changes for identical projects', () => {
    const p1 = prepareProject(baseProject)
    const p2 = prepareProject(baseProject)
    
    const diff = diffProjects(p1, p2)
    
    for (const target of diff.targets) {
      for (const script of target.scripts) {
        for (const block of script.blocks) {
          expect(block.type).toBe('unchanged')
        }
      }
      for (const comment of target.comments) {
        expect(comment.type).toBe('unchanged')
      }
      for (const costume of target.costumes) {
        expect(costume.type).toBe('unchanged')
      }
      for (const sound of target.sounds) {
        expect(sound.type).toBe('unchanged')
      }
    }
  })
  
  it('should detect modified block opcode', () => {
    const p1 = prepareProject(baseProject)
    const p2 = JSON.parse(JSON.stringify(p1))
    
    // Modify a block's opcode
    const block = p2.targets[0].scripts[0].blocks[0]
    block.opcode = 'different_opcode'
    block.contentHash = 'modified123'
    
    const diff = diffProjects(p1, p2)
    
    const targetDiff = diff.targets.find(t => t.semanticId === p1.targets[0].semanticId)
    const scriptDiff = targetDiff!.scripts.find(s => s.semanticId === p1.targets[0].scripts[0].semanticId)
    
    const modifiedBlock = scriptDiff!.blocks.find(b => b.type === 'modified')
    expect(modifiedBlock).toBeDefined()
    expect(modifiedBlock!.changes?.some(c => c.field === 'opcode')).toBe(true)
  })
  
  it('should detect changed input value', () => {
    const p1 = prepareProject(baseProject)
    const p2 = JSON.parse(JSON.stringify(p1))
    
    // Modify a block's input
    const block = p2.targets[0].scripts[0].blocks[1]
    block.inputs.STEPS = [1, [20]] // Changed from 10 to 20
    block.contentHash = 'modified123'
    
    const diff = diffProjects(p1, p2)
    
    const targetDiff = diff.targets.find(t => t.semanticId === p1.targets[0].semanticId)
    const scriptDiff = targetDiff!.scripts.find(s => s.semanticId === p1.targets[0].scripts[0].semanticId)
    
    const modifiedBlock = scriptDiff!.blocks.find(b => b.type === 'modified')
    expect(modifiedBlock).toBeDefined()
    expect(modifiedBlock!.changes?.some(c => c.field === 'STEPS')).toBe(true)
  })
  
  it('should detect added block', () => {
    const p1 = prepareProject(baseProject)
    const p2 = JSON.parse(JSON.stringify(p1))
    
    // Add a block to first script of first target
    const newBlock = {
      id: 'new-block',
      semanticId: 'script_0_0_block_99',
      opcode: 'motion_turnright',
      next: null,
      parent: p2.targets[0].scripts[0].blocks[0].semanticId,
      inputs: { DEGREES: [1, [90]] },
      fields: {},
      shadow: false,
      topLevel: false,
      contentHash: 'abc123'
    }
    p2.targets[0].scripts[0].blocks.push(newBlock)
    
    const diff = diffProjects(p1, p2)
    
    const targetDiff = diff.targets.find(t => t.semanticId === p1.targets[0].semanticId)
    const scriptDiff = targetDiff!.scripts.find(s => s.semanticId === p1.targets[0].scripts[0].semanticId)
    
    const addedBlock = scriptDiff!.blocks.find(b => b.type === 'added')
    expect(addedBlock).toBeDefined()
    expect(addedBlock!.newBlock?.opcode).toBe('motion_turnright')
  })
  
  it('should detect removed block', () => {
    const p1 = prepareProject(baseProject)
    const p2 = JSON.parse(JSON.stringify(p1))
    
    // Remove last block from first script
    p2.targets[0].scripts[0].blocks.pop()
    
    const diff = diffProjects(p1, p2)
    
    const targetDiff = diff.targets.find(t => t.semanticId === p1.targets[0].semanticId)
    const scriptDiff = targetDiff!.scripts.find(s => s.semanticId === p1.targets[0].scripts[0].semanticId)
    
    const removedBlock = scriptDiff!.blocks.find(b => b.type === 'removed')
    expect(removedBlock).toBeDefined()
  })
})
