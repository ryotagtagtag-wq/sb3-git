import { describe, it, expect } from 'vitest'
import { validateSB3Project } from '../../src/validate/schema.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const sampleProjectPath = join(__dirname, '..', 'fixtures', 'sample-project.json')

describe('SB3 Format', () => {
  let project: any
  
  beforeAll(async () => {
    const json = await readFile(sampleProjectPath, 'utf-8')
    project = JSON.parse(json)
  })
  
  it('should parse sample project', () => {
    const result = validateSB3Project(project)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.targets).toHaveLength(2)
      expect(result.data.targets[0].name).toBe('Stage')
      expect(result.data.targets[1].name).toBe('Sprite1')
    }
  })
  
  it('should have valid block structure', () => {
    const result = validateSB3Project(project)
    expect(result.success).toBe(true)
    if (result.success) {
      const sprite = result.data.targets[1]
      expect(sprite.blocks.block3.opcode).toBe('event_whenflagclicked')
      expect(sprite.blocks.block4.opcode).toBe('control_forever')
    }
  })
})
