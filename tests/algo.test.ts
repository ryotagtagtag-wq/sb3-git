import { describe, it, expect } from 'vitest'
import { diffProjects } from '../src/algo/diff.js'
import { threeWayMerge } from '../src/algo/three-way-merge.js'
import { normalize } from '../src/codec/normalize.js'
import { assignSemanticIds } from '../src/algo/id-assign.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const sampleProjectPath = join(__dirname, 'fixtures', 'sample-project.json')

describe('algo', () => {
  let baseProject: any
  
  beforeAll(async () => {
    const json = await readFile(sampleProjectPath, 'utf-8')
    baseProject = JSON.parse(json)
  })
  
  function prepareProject(project: any) {
    return assignSemanticIds(normalize(project))
  }
  
  it('should diff identical projects as unchanged', () => {
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
  
  it('should detect added blocks', () => {
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
    expect(targetDiff).toBeDefined()
    
    const scriptDiff = targetDiff!.scripts.find(s => s.semanticId === p1.targets[0].scripts[0].semanticId)
    expect(scriptDiff).toBeDefined()
    
    const addedBlock = scriptDiff!.blocks.find(b => b.type === 'added')
    expect(addedBlock).toBeDefined()
    expect(addedBlock!.newBlock?.opcode).toBe('motion_turnright')
  })
  
  it('should detect removed blocks', () => {
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
  
  it('should detect modified blocks', () => {
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
    expect(modifiedBlock!.changes).toBeDefined()
    expect(modifiedBlock!.changes!.some(c => c.field === 'STEPS')).toBe(true)
  })
  
  it('should three-way merge with no conflicts', () => {
    const base = prepareProject(baseProject)
    const ours = JSON.parse(JSON.stringify(base))
    const theirs = JSON.parse(JSON.stringify(base))
    
    // Ours: change first sprite's x position
    ours.targets[1].x = 50
    // Theirs: change first sprite's y position
    theirs.targets[1].y = 100
    
    const result = threeWayMerge(base, ours, theirs, { autoResolve: true })
    
    expect(result.project.targets[1].x).toBe(50) // ours
    expect(result.project.targets[1].y).toBe(100) // theirs
    expect(result.conflicts.length).toBe(0)
  })
  
  it('should three-way merge with conflict detection', () => {
    const base = prepareProject(baseProject)
    const ours = JSON.parse(JSON.stringify(base))
    const theirs = JSON.parse(JSON.stringify(base))
    
    // Both change the same property differently
    ours.targets[1].x = 50
    theirs.targets[1].x = 200
    
    const result = threeWayMerge(base, ours, theirs, { autoResolve: true })
    
    // Should have conflict - path uses target semanticId
    const conflict = result.conflicts.find(c => c.path.includes('target_1_sprite1.x'))
    expect(conflict).toBeDefined()
    expect(conflict!.autoResolved).toBe(true)
    expect(conflict!.resolution).toBe('ours')
    // Should prefer ours
    expect(result.project.targets[1].x).toBe(50)
  })
  
  it('should reassign semantic IDs after merge', () => {
    const base = prepareProject(baseProject)
    const ours = JSON.parse(JSON.stringify(base))
    const theirs = JSON.parse(JSON.stringify(base))
    
    ours.targets[1].x = 50
    theirs.targets[1].y = 100
    
    const result = threeWayMerge(base, ours, theirs, { autoResolve: true })
    
    // Check that semantic IDs are properly formatted
    for (let i = 0; i < result.project.targets.length; i++) {
      const target = result.project.targets[i]
      expect(target.semanticId).toMatch(new RegExp(`^target_${i}_`))
      
      for (let j = 0; j < target.scripts.length; j++) {
        const script = target.scripts[j]
        expect(script.semanticId).toBe(`script_${i}_${j}`)
        
        for (let k = 0; k < script.blocks.length; k++) {
          expect(script.blocks[k].semanticId).toBe(`script_${i}_${j}_block_${k}`)
        }
      }
    }
  })
})
