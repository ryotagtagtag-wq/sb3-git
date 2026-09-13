// SB3 import/export with deterministic JSON output
import JSZip from '@turbowarp/jszip'
import type { SB3Project, SB3Target, SB3Block, SB3Input, SB3Field, SB3Comment, SB3Costume, SB3Sound, SB3Monitor, SB3Extension, SB3Meta } from './types.js'

export async function importSB3(buffer: Buffer): Promise<SB3Project> {
  const zip = await JSZip.loadAsync(buffer)
  const projectJson = zip.file('project.json')
  if (!projectJson) {
    throw new Error('project.json not found in .sb3 file')
  }
  const jsonStr = await projectJson.async('string')
  return JSON.parse(jsonStr) as SB3Project
}

export async function exportSB3(project: SB3Project, assets: Map<string, Buffer>): Promise<Buffer> {
  const zip = new JSZip()
  
  // Deterministic JSON: sorted keys, no whitespace
  const jsonStr = deterministicStringify(project)
  zip.file('project.json', jsonStr)
  
  // Add assets in deterministic order
  const sortedAssets = Array.from(assets.entries()).sort(([a], [b]) => a.localeCompare(b))
  for (const [filename, data] of sortedAssets) {
    zip.file(filename, data)
  }
  
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })
}

function deterministicStringify(obj: unknown): string {
  const seen = new WeakSet()
  return JSON.stringify(obj, (key, value) => {
    if (value && typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]'
      }
      seen.add(value)
      if (Array.isArray(value)) return value
      // Sort object keys
      const sorted: Record<string, unknown> = {}
      for (const k of Object.keys(value).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k]
      }
      return sorted
    }
    return value
  })
}

// Extract assets from SB3
export async function extractAssets(buffer: Buffer): Promise<Map<string, Buffer>> {
  const zip = await JSZip.loadAsync(buffer)
  const assets = new Map<string, Buffer>()
  for (const [filename, file] of Object.entries(zip.files)) {
    if (filename !== 'project.json' && !file.dir) {
      const data = await file.async('arraybuffer')
      assets.set(filename, Buffer.from(data))
    }
  }
  return assets
}
