// Bidirectional conversion between intermediate format and filesystem (git-trackable)
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IntermediateProject, IntermediateTarget, IntermediateScript, IntermediateBlock, IntermediateComment, IntermediateCostume, IntermediateSound, ExpandedProject } from './types.js'

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
