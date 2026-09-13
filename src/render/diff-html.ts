// HTML diff reports with scratchblocks SVG rendering
import { JSDOM } from 'jsdom'
import type { ProjectDiff, TargetDiff, ScriptDiff, BlockDiff, CommentDiff, AssetDiff, PropertyDiff, MonitorDiff, ExtensionDiff } from '../algo/diff.js'
import type { IntermediateBlock } from '../codec/types.js'

// Setup jsdom for scratchblocks
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  pretendToBeVisual: true,
  resources: 'usable'
})
const win = dom.window as unknown as Window & typeof globalThis
global.window = win
global.document = dom.window.document
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, writable: true, configurable: true })
global.HTMLElement = dom.window.HTMLElement
global.SVGElement = dom.window.SVGElement
global.HTMLCanvasElement = dom.window.HTMLCanvasElement
// @ts-expect-error - global property access via index signature
Object.defineProperty(global, 'CanvasRenderingContext2D', { value: dom.window.CanvasRenderingContext2D, writable: true, configurable: true })
// @ts-expect-error - global property access via index signature
Object.defineProperty(global, 'Image', { value: dom.window.Image, writable: true, configurable: true })

// Import scratchblocks after jsdom setup
let renderBlocks: (code: string, options: { style: string }) => string

const scratchblocksModule = await import('scratchblocks')
const scratchblocks = (scratchblocksModule as any).default || scratchblocksModule
renderBlocks = scratchblocks.render || scratchblocks

export function generateDiffHTML(diff: ProjectDiff, options: { title?: string; baseLabel?: string; newLabel?: string } = {}): string {
  const { title = 'SB3 Diff Report', baseLabel = 'Base', newLabel = 'Modified' } = options
  
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${getStyles()}</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="legend">
      <span class="legend-item"><span class="color unchanged"></span>Unchanged</span>
      <span class="legend-item"><span class="color added"></span>Added</span>
      <span class="legend-item"><span class="color removed"></span>Removed</span>
      <span class="legend-item"><span class="color modified"></span>Modified</span>
    </div>
  </header>
  
  <main>`
  
  // Targets
  if (diff.targets.length > 0) {
    html += `<section class="targets">
      <h2>Targets (${diff.targets.length})</h2>`
    
    for (const target of diff.targets) {
      html += renderTargetDiff(target)
    }
    
    html += `</section>`
  }
  
  // Monitors
  if (diff.monitors.length > 0) {
    html += `<section class="monitors">
      <h2>Monitors (${diff.monitors.length})</h2>
      <table>
        <thead><tr><th>Semantic ID</th><th>Type</th><th>Changes</th></tr></thead>
        <tbody>`
    
    for (const monitor of diff.monitors) {
      html += `<tr class="${monitor.type}">
        <td>${escapeHtml(monitor.semanticId)}</td>
        <td>${monitor.type}</td>
        <td>${monitor.changes?.map(c => `${c.field}: ${JSON.stringify(c.oldValue)} → ${JSON.stringify(c.newValue)}`).join(', ') || '—'}</td>
      </tr>`
    }
    
    html += `</tbody></table></section>`
  }
  
  // Extensions
  if (diff.extensions.length > 0) {
    html += `<section class="extensions">
      <h2>Extensions (${diff.extensions.length})</h2>
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Version</th></tr></thead>
        <tbody>`
    
    for (const ext of diff.extensions) {
      html += `<tr class="${ext.type}">
        <td>${escapeHtml(ext.name)}</td>
        <td>${ext.type}</td>
        <td>${ext.oldVersion ? `${ext.oldVersion} → ${ext.newVersion}` : ext.newVersion || '—'}</td>
      </tr>`
    }
    
    html += `</tbody></table></section>`
  }
  
  html += `</main>
  <script>${getScript()}</script>
</body>
</html>`
  
  return html
}

function renderTargetDiff(target: TargetDiff): string {
  let html = `<details class="target" open>
    <summary class="${target.scripts.some(s => s.blocks.some(b => b.type !== 'unchanged')) ? 'modified' : 'unchanged'}">
      <span class="target-name">${escapeHtml(target.name)}</span>
      <span class="target-id">${escapeHtml(target.semanticId)}</span>
    </summary>
    <div class="target-content">`
  
  // Properties
  if (target.properties.length > 0) {
    html += `<section class="properties">
      <h3>Properties</h3>
      <table>
        <thead><tr><th>Property</th><th>Old</th><th>New</th></tr></thead>
        <tbody>`
    for (const prop of target.properties) {
      html += `<tr>
        <td>${escapeHtml(prop.property)}</td>
        <td><pre>${escapeHtml(JSON.stringify(prop.oldValue, null, 2))}</pre></td>
        <td><pre>${escapeHtml(JSON.stringify(prop.newValue, null, 2))}</pre></td>
      </tr>`
    }
    html += `</tbody></table></section>`
  }
  
  // Scripts
  if (target.scripts.length > 0) {
    html += `<section class="scripts">
      <h3>Scripts (${target.scripts.length})</h3>`
    
    for (const script of target.scripts) {
      const hasChanges = script.blocks.some(b => b.type !== 'unchanged')
      html += `<details class="script ${hasChanges ? 'modified' : 'unchanged'}" ${hasChanges ? 'open' : ''}>
        <summary>Script: ${escapeHtml(script.semanticId)}</summary>
        <div class="script-blocks">`
      
      for (const block of script.blocks) {
        html += renderBlockDiff(block)
      }
      
      html += `</div></details>`
    }
    
    html += `</section>`
  }
  
  // Comments
  if (target.comments.length > 0) {
    html += `<section class="comments">
      <h3>Comments (${target.comments.length})</h3>`
    
    for (const comment of target.comments) {
      html += renderCommentDiff(comment)
    }
    
    html += `</section>`
  }
  
  // Costumes
  if (target.costumes.length > 0) {
    html += `<section class="costumes">
      <h3>Costumes (${target.costumes.length})</h3>
      <table>
        <thead><tr><th>Semantic ID</th><th>Name</th><th>Type</th><th>MD5</th></tr></thead>
        <tbody>`
    for (const costume of target.costumes) {
      html += `<tr class="${costume.type}">
        <td>${escapeHtml(costume.semanticId)}</td>
        <td>${escapeHtml(costume.name)}</td>
        <td>${costume.type}</td>
        <td>${costume.oldMd5 ? `${costume.oldMd5} → ${costume.newMd5}` : costume.newMd5 || '—'}</td>
      </tr>`
    }
    html += `</tbody></table></section>`
  }
  
  // Sounds
  if (target.sounds.length > 0) {
    html += `<section class="sounds">
      <h3>Sounds (${target.sounds.length})</h3>
      <table>
        <thead><tr><th>Semantic ID</th><th>Name</th><th>Type</th><th>MD5</th></tr></thead>
        <tbody>`
    for (const sound of target.sounds) {
      html += `<tr class="${sound.type}">
        <td>${escapeHtml(sound.semanticId)}</td>
        <td>${escapeHtml(sound.name)}</td>
        <td>${sound.type}</td>
        <td>${sound.oldMd5 ? `${sound.oldMd5} → ${sound.newMd5}` : sound.newMd5 || '—'}</td>
      </tr>`
    }
    html += `</tbody></table></section>`
  }
  
  html += `</div></details>`
  return html
}

function renderBlockDiff(block: BlockDiff): string {
  const typeClass = block.type
  let html = `<div class="block ${typeClass}" data-semantic-id="${escapeHtml(block.semanticId)}">`
  
  if (block.type === 'unchanged') {
    html += `<span class="block-type">•</span> ${escapeHtml(block.baseBlock?.opcode || '')} <span class="semantic-id">${escapeHtml(block.semanticId)}</span>`
  } else if (block.type === 'added') {
    html += `<span class="block-type">+</span> ${escapeHtml(block.newBlock?.opcode || '')} <span class="semantic-id">${escapeHtml(block.semanticId)}</span>`
    if (block.newBlock) {
      html += renderScratchblocks(block.newBlock)
    }
  } else if (block.type === 'removed') {
    html += `<span class="block-type">−</span> ${escapeHtml(block.baseBlock?.opcode || '')} <span class="semantic-id">${escapeHtml(block.semanticId)}</span>`
    if (block.baseBlock) {
      html += renderScratchblocks(block.baseBlock)
    }
  } else if (block.type === 'modified') {
    html += `<span class="block-type">≠</span> ${escapeHtml(block.baseBlock?.opcode || '')} → ${escapeHtml(block.newBlock?.opcode || '')} <span class="semantic-id">${escapeHtml(block.semanticId)}</span>`
    if (block.changes && block.changes.length > 0) {
      html += `<div class="block-changes">`
      for (const change of block.changes) {
        html += `<div class="change"><span class="field">${escapeHtml(change.field)}</span>: <span class="old">${escapeHtml(JSON.stringify(change.oldValue))}</span> → <span class="new">${escapeHtml(JSON.stringify(change.newValue))}</span></div>`
      }
      html += `</div>`
    }
    if (block.baseBlock) {
      html += `<div class="block-versions"><h5>Base</h5>${renderScratchblocks(block.baseBlock)}`
    }
    if (block.newBlock) {
      html += `<h5>Modified</h5>${renderScratchblocks(block.newBlock)}</div>`
    }
  }
  
  html += `</div>`
  return html
}

function renderCommentDiff(comment: CommentDiff): string {
  let html = `<div class="comment ${comment.type}">`
  
  if (comment.type === 'unchanged') {
    html += `<span class="comment-type">•</span> ${escapeHtml(comment.id)}`
  } else if (comment.type === 'added') {
    html += `<span class="comment-type">+</span> ${escapeHtml(comment.newComment?.text || '')}`
  } else if (comment.type === 'removed') {
    html += `<span class="comment-type">−</span> ${escapeHtml(comment.oldComment?.text || '')}`
  } else if (comment.type === 'modified') {
    html += `<span class="comment-type">≠</span> ${escapeHtml(comment.oldComment?.text || '')} → ${escapeHtml(comment.newComment?.text || '')}`
  }
  
  html += `</div>`
  return html
}

function renderScratchblocks(block: IntermediateBlock): string {
  try {
    // Convert block to scratchblocks notation
    const sbCode = blockToScratchblocks(block)
    const svg = renderBlocks(sbCode, { style: 'scratch3' })
    return `<div class="scratchblocks-svg">${svg}</div>`
  } catch {
    return `<div class="scratchblocks-error">Failed to render block</div>`
  }
}

function blockToScratchblocks(block: IntermediateBlock): string {
  // Simple conversion to scratchblocks notation
  const opcode = block.opcode
  const inputs = block.inputs
  const fields = block.fields
  
  let result = opcode
  
  // Add fields
  for (const [key, value] of Object.entries(fields)) {
    result += ` ${key}: ${value[1]}`
  }
  
  // Add inputs (simplified)
  for (const [key, value] of Object.entries(inputs)) {
    const val = value[1]
    if (typeof val === 'string' || typeof val === 'number') {
      result += ` ${key}: ${val}`
    }
  }
  
  return result
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;')
}

function getStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
    h1 { margin: 0 0 10px; color: #333; }
    h2 { color: #444; border-bottom: 1px solid #eee; padding-bottom: 5px; }
    h3 { color: #555; }
    h4 { color: #666; }
    h5 { color: #777; margin: 10px 0 5px; }
    .legend { display: flex; gap: 20px; flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 5px; font-size: 14px; }
    .color { display: inline-block; width: 16px; height: 16px; border-radius: 3px; }
    .color.unchanged { background: #28a745; }
    .color.added { background: #007bff; }
    .color.removed { background: #dc3545; }
    .color.modified { background: #ffc107; }
    .target { border: 1px solid #ddd; border-radius: 8px; margin-bottom: 20px; background: #fafafa; }
    .target summary { padding: 15px 20px; cursor: pointer; font-weight: 600; display: flex; justify-content: space-between; align-items: center; }
    .target summary.modified { background: #fff3cd; }
    .target summary.unchanged { background: #d4edda; }
    .target-name { font-size: 1.1em; }
    .target-id { font-family: monospace; font-size: 0.85em; color: #666; }
    .target-content { padding: 0 20px 20px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f5f5f5; font-weight: 600; }
    tr.unchanged { background: #f8fff8; }
    tr.added { background: #f0f8ff; }
    tr.removed { background: #fff0f0; }
    tr.modified { background: #fffdf0; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 0.85em; background: #f5f5f5; padding: 8px; border-radius: 4px; max-height: 200px; overflow: auto; }
    .script { border-left: 3px solid #ddd; margin: 15px 0; padding-left: 15px; }
    .script summary { cursor: pointer; font-weight: 500; padding: 5px 0; }
    .script.modified summary { color: #856404; }
    .script.modified { border-left-color: #ffc107; }
    .script.unchanged { border-left-color: #28a745; }
    .script-blocks { margin-top: 10px; }
    .block { padding: 8px 12px; margin: 5px 0; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
    .block.unchanged { background: #f8fff8; border-left: 3px solid #28a745; }
    .block.added { background: #f0f8ff; border-left: 3px solid #007bff; }
    .block.removed { background: #fff0f0; border-left: 3px solid #dc3545; }
    .block.modified { background: #fffdf0; border-left: 3px solid #ffc107; }
    .block-type { font-weight: bold; margin-right: 8px; }
    .block.added .block-type { color: #007bff; }
    .block.removed .block-type { color: #dc3545; }
    .block.modified .block-type { color: #856404; }
    .semantic-id { color: #999; font-size: 0.8em; margin-left: 10px; }
    .block-changes { margin-top: 8px; padding-left: 20px; font-size: 0.85em; }
    .change { margin: 3px 0; }
    .field { font-weight: 600; color: #555; }
    .old { color: #dc3545; }
    .new { color: #28a745; }
    .block-versions { margin-top: 10px; }
    .scratchblocks-svg { margin: 10px 0; }
    .scratchblocks-svg svg { max-width: 100%; height: auto; }
    .comment { padding: 8px 12px; margin: 5px 0; border-radius: 4px; border-left: 3px solid #ddd; }
    .comment.added { background: #f0f8ff; border-left-color: #007bff; }
    .comment.removed { background: #fff0f0; border-left-color: #dc3545; }
    .comment.modified { background: #fffdf0; border-left-color: #ffc107; }
    .comment-type { font-weight: bold; margin-right: 8px; }
    .comment.added .comment-type { color: #007bff; }
    .comment.removed .comment-type { color: #dc3545; }
    .comment.modified .comment-type { color: #856404; }
    details > summary { list-style: none; }
    details > summary::-webkit-details-marker { display: none; }
    details > summary::before { content: '▶ '; font-size: 0.7em; transition: transform 0.2s; display: inline-block; }
    details[open] > summary::before { transform: rotate(90deg); }
  `
}

function getScript(): string {
  return `
    document.addEventListener('DOMContentLoaded', () => {
      // Add copy buttons to code blocks
      document.querySelectorAll('pre').forEach(pre => {
        const btn = document.createElement('button')
        btn.textContent = 'Copy'
        btn.className = 'copy-btn'
        btn.style.cssText = 'position:absolute;top:5px;right:5px;padding:2px 8px;font-size:12px;background:#333;color:white;border:none;border-radius:3px;cursor:pointer;'
        pre.style.position = 'relative'
        pre.appendChild(btn)
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(pre.textContent || '')
          btn.textContent = 'Copied!'
          setTimeout(() => btn.textContent = 'Copy', 2000)
        })
      })
    })
  `
}
