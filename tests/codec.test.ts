import { describe, it, expect } from 'vitest'
import { importSB3, exportSB3, extractAssets } from '../src/codec/sb3.js'
import { normalize } from '../src/codec/normalize.js'
import { assignSemanticIds } from '../src/algo/id-assign.js'
import { expandToFiles, collapseFromFiles } from '../src/codec/expand.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const sampleProjectPath = join(__dirname, 'fixtures/sample-project.json')

describe('codec', () => {
  let sampleProject: any
  
  beforeAll(async () => {
    const json = await readFile(sampleProjectPath, 'utf-8')
    sampleProject = JSON.parse(json)
  })
  
  it('should parse SB3 project structure', () => {
    expect(sampleProject.targets).toHaveLength(2)
    expect(sampleProject.targets[0].name).toBe('Stage')
    expect(sampleProject.targets[1].name).toBe('Sprite1')
    expect(sampleProject.meta.semver).toBe('3.0.0')
  })
  
  it('should normalize project deterministically', () => {
    const normalized1 = normalize(sampleProject)
    const normalized2 = normalize(sampleProject)
    
    // Should produce identical results
    expect(JSON.stringify(normalized1)).toBe(JSON.stringify(normalized2))
    
    // Should have semantic IDs
    expect(normalized1.targets[0].semanticId).toBeDefined()
    expect(normalized1.targets[0].scripts).toBeDefined()
  })
  
  it('should assign semantic IDs', () => {
    const normalized = normalize(sampleProject)
    const withIds = assignSemanticIds(normalized)
    
    // Check target semantic IDs
    expect(withIds.targets[0].semanticId).toMatch(/^target_0_/)
    expect(withIds.targets[1].semanticId).toMatch(/^target_1_/)
    
    // Check script semantic IDs
    for (const target of withIds.targets) {
      for (const script of target.scripts) {
        expect(script.semanticId).toMatch(/^script_\d+_\d+$/)
        for (const block of script.blocks) {
          expect(block.semanticId).toMatch(/^script_\d+_\d+_block_\d+$/)
        }
      }
    }
  })
  
  it('should expand and collapse round-trip', async () => {
    const normalized = normalize(sampleProject)
    const withIds = assignSemanticIds(normalized)
    
    const testDir = join(__dirname, 'fixtures/roundtrip-test')
    await expandToFiles(withIds, testDir)
    const collapsed = await collapseFromFiles(testDir)
    
    // Should preserve structure
    expect(collapsed.targets.length).toBe(withIds.targets.length)
    expect(collapsed.targets[0].name).toBe(withIds.targets[0].name)
    expect(collapsed.targets[1].name).toBe(withIds.targets[1].name)
  })
})
