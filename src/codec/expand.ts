// Bidirectional conversion between intermediate format and filesystem (git-trackable)
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { 
  IntermediateProject, 
  IntermediateTarget, 
  IntermediateScript, 
  IntermediateBlock, 
  IntermediateComment, 
  IntermediateCostume, 
  IntermediateSound, 
  IntermediateMonitor,
  IntermediateExtension,
  IntermediateMeta,
  IntermediateInput,
  IntermediateInputValue,
  ExpandedProject 
} from './types.js'
import type { 
  SB3Project, 
  SB3Target, 
  SB3Block, 
  SB3Input, 
  SB3Field, 
  SB3Comment, 
  SB3Costume, 
  SB3Sound, 
  SB3Monitor, 
  SB3Extension, 
  SB3Meta 
} from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function expandToFiles(project: IntermediateProject, outputDir: string): Promise<void> {
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })
  
  // Write project.json (pretty-printed)
  await writeFile(join(outputDir, 'project.json'), JSON.stringify(project, null, 2))
  
  // Create directories for each target
  for (const target of project.targets) {
    const targetDir = join(outputDir, 'targets', sanitizeFilename(target.semanticId))
    await mkdir(targetDir, { recursive: true })
    
    // Write scripts
    const scriptsDir = join(targetDir, 'scripts')
    await mkdir(scriptsDir, { recursive: true })
    
    for (const script of target.scripts) {
      const scriptFile = join(scriptsDir, `${script.semanticId}.json`)
      await writeFile(scriptFile, JSON.stringify(script, null, 2))
    }
    
    // Write comments
    if (target.comments.length > 0) {
      await writeFile(join(targetDir, 'comments.json'), JSON.stringify(target.comments, null, 2))
    }
    
    // Write costumes metadata
    if (target.costumes.length > 0) {
      await writeFile(join(targetDir, 'costumes.json'), JSON.stringify(target.costumes, null, 2))
    }
    
    // Write sounds metadata
    if (target.sounds.length > 0) {
      await writeFile(join(targetDir, 'sounds.json'), JSON.stringify(target.sounds, null, 2))
    }
  }
  
  // Write monitors
  if (project.monitors.length > 0) {
    await writeFile(join(outputDir, 'monitors.json'), JSON.stringify(project.monitors, null, 2))
  }
  
  // Write extensions
  if (project.extensions.length > 0) {
    await writeFile(join(outputDir, 'extensions.json'), JSON.stringify(project.extensions, null, 2))
  }
}

export async function collapseFromFiles(inputDir: string): Promise<IntermediateProject> {
  const projectPath = join(inputDir, 'project.json')
  const projectJson = await readFile(projectPath, 'utf-8')
  const project = JSON.parse(projectJson) as IntermediateProject
  
  // Read target directories
  const targetsDir = join(inputDir, 'targets')
  try {
    const targetDirs = await readDir(targetsDir)
    for (const targetDir of targetDirs) {
      const target = project.targets.find(t => t.semanticId === targetDir)
      if (!target) continue
      
      // Read scripts
      const scriptsDir = join(targetsDir, targetDir, 'scripts')
      try {
        const scriptFiles = await readDir(scriptsDir)
        for (const scriptFile of scriptFiles) {
          if (scriptFile.endsWith('.json')) {
            const scriptPath = join(scriptsDir, scriptFile)
            const scriptJson = await readFile(scriptPath, 'utf-8')
            const script = JSON.parse(scriptJson) as IntermediateScript
            const existingIndex = target.scripts.findIndex(s => s.semanticId === script.semanticId)
            if (existingIndex >= 0) {
              target.scripts[existingIndex] = script
            } else {
              target.scripts.push(script)
            }
          }
        }
      } catch {
        // scripts dir might not exist
      }
      
      // Read comments
      const commentsPath = join(targetsDir, targetDir, 'comments.json')
      try {
        const commentsJson = await readFile(commentsPath, 'utf-8')
        target.comments = JSON.parse(commentsJson)
      } catch {
        // comments might not exist
      }
      
      // Read costumes
      const costumesPath = join(targetsDir, targetDir, 'costumes.json')
      try {
        const costumesJson = await readFile(costumesPath, 'utf-8')
        target.costumes = JSON.parse(costumesJson)
      } catch {
        // costumes might not exist
      }
      
      // Read sounds
      const soundsPath = join(targetsDir, targetDir, 'sounds.json')
      try {
        const soundsJson = await readFile(soundsPath, 'utf-8')
        target.sounds = JSON.parse(soundsJson)
      } catch {
        // sounds might not exist
      }
    }
  } catch {
    // targets dir might not exist
  }
  
  // Read monitors
  const monitorsPath = join(inputDir, 'monitors.json')
  try {
    const monitorsJson = await readFile(monitorsPath, 'utf-8')
    project.monitors = JSON.parse(monitorsJson)
  } catch {
    // monitors might not exist
  }
  
  // Read extensions
  const extensionsPath = join(inputDir, 'extensions.json')
  try {
    const extensionsJson = await readFile(extensionsPath, 'utf-8')
    project.extensions = JSON.parse(extensionsJson)
  } catch {
    // extensions might not exist
  }
  
  return project
}

async function readDir(dir: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises')
  return readdir(dir)
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

// Asset handling
export async function extractAssetsToFiles(assets: Map<string, Buffer>, outputDir: string): Promise<void> {
  const assetsDir = join(outputDir, 'assets')
  await mkdir(assetsDir, { recursive: true })
  
  const costumesDir = join(assetsDir, 'costumes')
  const soundsDir = join(assetsDir, 'sounds')
  await mkdir(costumesDir, { recursive: true })
  await mkdir(soundsDir, { recursive: true })
  
  for (const [filename, data] of assets) {
    // Determine if costume or sound by extension
    const ext = filename.split('.').pop()?.toLowerCase()
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')
    const targetDir = isImage ? costumesDir : soundsDir
    await writeFile(join(targetDir, filename), data)
  }
}

export async function collectAssetsFromFiles(inputDir: string): Promise<Map<string, Buffer>> {
  const assets = new Map<string, Buffer>()
  const assetsDir = join(inputDir, 'assets')
  
  try {
    const { readdir } = await import('node:fs/promises')
    const [costumesDir, soundsDir] = [join(assetsDir, 'costumes'), join(assetsDir, 'sounds')]
    
    for (const dir of [costumesDir, soundsDir]) {
      try {
        const files = await readdir(dir)
        for (const file of files) {
          const filePath = join(dir, file)
          const { stat } = await import('node:fs/promises')
          const stats = await stat(filePath)
          if (stats.isFile()) {
            const data = await readFile(filePath)
            assets.set(file, data)
          }
        }
      } catch {
        // Directory might not exist
      }
    }
  } catch {
    // assets dir might not exist
  }
  
  return assets
}

// Convert IntermediateProject back to SB3Project format (with blocks instead of scripts)
// Using type assertions to bypass strict type checking for conversion
export function intermediateToSB3(project: IntermediateProject): SB3Project {
  return {
    targets: project.targets.map(target => intermediateTargetToSB3(target) as any),
    monitors: project.monitors.map(intermediateMonitorToSB3 as any),
    extensions: project.extensions.map(intermediateExtensionToSB3 as any),
    meta: intermediateMetaToSB3(project.meta) as any
  }
}

function intermediateTargetToSB3(target: IntermediateTarget): any {
  // Flatten scripts back to blocks
  const blocks: Record<string, any> = {}
  
  for (const script of target.scripts) {
    for (let i = 0; i < script.blocks.length; i++) {
      const block = script.blocks[i]
      if (!block) continue
      const blockId = block.id
      const nextBlock = script.blocks[i + 1]
      
      blocks[blockId] = {
        opcode: block.opcode,
        next: nextBlock ? nextBlock.id : null,
        parent: block.parent,
        inputs: intermediateInputsToSB3(block.inputs),
        fields: Object.fromEntries(
          Object.entries(block.fields).map(([k, v]) => [k, [v[0], v[1]]])
        ),
        shadow: block.shadow,
        topLevel: i === 0,
        x: block.x,
        y: block.y
      }
    }
  }
  
  return {
    name: target.name,
    variables: Object.fromEntries(
      Object.entries(target.variables).map(([k, v]) => [k, [v[0], v[1]]])
    ),
    lists: Object.fromEntries(
      Object.entries(target.lists).map(([k, v]) => [k, [v[0], v[1]]])
    ),
    broadcasts: Object.fromEntries(
      Object.entries(target.broadcasts).map(([k, v]) => [k, v])
    ),
    blocks,
    comments: Object.fromEntries(
      target.comments.map(c => [c.id, {
        blockId: c.blockSemanticId,
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
        minimized: c.minimized,
        text: c.text
      }])
    ),
    costumes: target.costumes.map(c => ({
      name: c.name,
      bitmapResolution: c.bitmapResolution,
      dataFormat: c.dataFormat,
      assetId: c.assetId,
      md5ext: c.md5ext,
      rotationCenterX: c.rotationCenterX,
      rotationCenterY: c.rotationCenterY
    })),
    sounds: target.sounds.map(s => ({
      name: s.name,
      dataFormat: s.dataFormat,
      assetId: s.assetId,
      md5ext: s.md5ext,
      rate: s.rate,
      sampleCount: s.sampleCount
    })),
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

function intermediateInputsToSB3(inputs: Record<string, IntermediateInput>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(inputs)) {
    result[key] = [value[0], intermediateInputValueToSB3(value[1])]
  }
  return result
}

function intermediateInputValueToSB3(value: IntermediateInputValue): any {
  if (Array.isArray(value)) {
    return value.map(intermediateInputValueToSB3)
  }
  if (typeof value === 'object' && value !== null) {
    return value
  }
  return value
}

function intermediateMonitorToSB3(monitor: IntermediateMonitor): any {
  return {
    id: monitor.id,
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

function intermediateExtensionToSB3(ext: IntermediateExtension): any {
  return {
    name: ext.name,
    version: ext.version
  }
}

function intermediateMetaToSB3(meta: IntermediateMeta): any {
  return {
    semver: meta.semver,
    vm: meta.vm,
    agent: meta.agent
  }
}
