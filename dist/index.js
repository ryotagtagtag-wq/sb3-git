#!/usr/bin/env node

// src/codec/sb3.ts
import JSZip from "@turbowarp/jszip";
async function importSB3(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const projectJson = zip.file("project.json");
  if (!projectJson) {
    throw new Error("project.json not found in .sb3 file");
  }
  const jsonStr = await projectJson.async("string");
  return JSON.parse(jsonStr);
}
async function exportSB3(project, assets) {
  const zip = new JSZip();
  const jsonStr = deterministicStringify(project);
  zip.file("project.json", jsonStr);
  const sortedAssets = Array.from(assets.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [filename, data] of sortedAssets) {
    zip.file(filename, data);
  }
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}
function deterministicStringify(obj) {
  const seen = /* @__PURE__ */ new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (value && typeof value === "object") {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
      if (Array.isArray(value)) return value;
      const sorted = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = value[k];
      }
      return sorted;
    }
    return value;
  });
}
async function extractAssets(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const assets = /* @__PURE__ */ new Map();
  for (const [filename, file] of Object.entries(zip.files)) {
    if (filename !== "project.json" && !file.dir) {
      const data = await file.async("arraybuffer");
      assets.set(filename, Buffer.from(data));
    }
  }
  return assets;
}

// src/codec/normalize.ts
import { createHash } from "crypto";
function normalize(project) {
  const sortedTargets = [...project.targets].sort((a, b) => a.layerOrder - b.layerOrder);
  return {
    targets: sortedTargets.map(normalizeTarget),
    monitors: project.monitors.map(normalizeMonitor),
    extensions: project.extensions.map(normalizeExtension),
    meta: normalizeMeta(project.meta)
  };
}
function normalizeTarget(target) {
  const scripts = extractScripts(target.blocks);
  return {
    name: target.name,
    semanticId: `target_${target.name.replace(/\s+/g, "_").toLowerCase()}`,
    variables: Object.fromEntries(
      Object.entries(target.variables).sort(([a], [b]) => a.localeCompare(b))
    ),
    lists: Object.fromEntries(
      Object.entries(target.lists).sort(([a], [b]) => a.localeCompare(b))
    ),
    broadcasts: Object.fromEntries(
      Object.entries(target.broadcasts).sort(([a], [b]) => a.localeCompare(b))
    ),
    scripts: scripts.map(assignSemanticIds),
    comments: Object.entries(target.comments).sort(([a], [b]) => a.localeCompare(b)).map(([id, comment]) => normalizeComment(id, comment)),
    costumes: target.costumes.map((c, i) => normalizeCostume(c, i)),
    sounds: target.sounds.map((s, i) => normalizeSound(s, i)),
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
  };
}
function extractScripts(blocks) {
  const visited = /* @__PURE__ */ new Set();
  const scripts = [];
  const topLevelEntries = Object.entries(blocks).filter(([, block]) => block.topLevel).sort(([a, blockA], [b, blockB]) => {
    const yA = blockA.y ?? 0;
    const yB = blockB.y ?? 0;
    if (yA !== yB) return yA - yB;
    const xA = blockA.x ?? 0;
    const xB = blockB.x ?? 0;
    return xA - xB;
  });
  for (const [id, block] of topLevelEntries) {
    if (!visited.has(id)) {
      const scriptBlocks = [];
      traverseScript(id, block, blocks, visited, scriptBlocks);
      if (scriptBlocks.length > 0) {
        scripts.push({ blocks: scriptBlocks, semanticId: "" });
      }
    }
  }
  return scripts;
}
function traverseScript(id, block, allBlocks, visited, output) {
  if (visited.has(id)) return;
  visited.add(id);
  const intermediateBlock = normalizeBlock(id, block);
  output.push(intermediateBlock);
  for (const input of Object.values(block.inputs)) {
    const inputValue = input[1];
    if (typeof inputValue === "object" && inputValue !== null && !Array.isArray(inputValue)) {
      if ("opcode" in inputValue) {
        const nestedId = Object.keys(allBlocks).find((k) => allBlocks[k] === inputValue);
        if (nestedId && !visited.has(nestedId)) {
          traverseScript(nestedId, inputValue, allBlocks, visited, output);
        }
      }
    } else if (Array.isArray(inputValue)) {
      for (const item of inputValue) {
        if (item && typeof item === "object" && "opcode" in item) {
          const nestedId = Object.keys(allBlocks).find((k) => allBlocks[k] === item);
          if (nestedId && !visited.has(nestedId)) {
            traverseScript(nestedId, item, allBlocks, visited, output);
          }
        }
      }
    }
  }
  if (block.next) {
    const nextBlock = allBlocks[block.next];
    if (nextBlock && !visited.has(block.next)) {
      traverseScript(block.next, nextBlock, allBlocks, visited, output);
    }
  }
}
function normalizeBlock(id, block) {
  return {
    id,
    semanticId: "",
    // Will be assigned later
    opcode: block.opcode,
    next: block.next,
    parent: block.parent,
    inputs: normalizeInputs(block.inputs),
    fields: Object.fromEntries(
      Object.entries(block.fields).sort(([a], [b]) => a.localeCompare(b))
    ),
    shadow: block.shadow,
    topLevel: block.topLevel,
    x: block.x,
    y: block.y,
    contentHash: computeBlockContentHash(block)
  };
}
function normalizeInputs(inputs) {
  const result = {};
  for (const [key, value] of Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))) {
    result[key] = [value[0], normalizeInputValue(value[1])];
  }
  return result;
}
function normalizeInputValue(value) {
  if (typeof value === "object" && value !== null) {
    if (Array.isArray(value)) {
      return value.map(normalizeInputValue);
    }
    if ("opcode" in value) {
      return "[BLOCK_REF]";
    }
  }
  return value;
}
function computeBlockContentHash(block) {
  const hash = createHash("sha256");
  hash.update(block.opcode);
  for (const [key, input] of Object.entries(block.inputs).sort()) {
    hash.update(key);
    hash.update(String(input[0]));
    if (typeof input[1] !== "object" || input[1] === null || Array.isArray(input[1])) {
      hash.update(JSON.stringify(input[1]));
    }
  }
  for (const [key, field] of Object.entries(block.fields).sort()) {
    hash.update(key);
    hash.update(field[0]);
    hash.update(field[1]);
  }
  hash.update(String(block.shadow));
  return hash.digest("hex").slice(0, 16);
}
function assignSemanticIds(script, scriptIndex) {
  let blockIndex = 0;
  const semanticId = `script_${scriptIndex}_block_${blockIndex}`;
  for (const block of script.blocks) {
    block.semanticId = `script_${scriptIndex}_block_${blockIndex}`;
    blockIndex++;
  }
  return { ...script, semanticId };
}
function normalizeComment(id, comment) {
  return {
    id,
    blockSemanticId: comment.blockId,
    // Will be mapped to semantic ID later
    x: comment.x,
    y: comment.y,
    width: comment.width,
    height: comment.height,
    minimized: comment.minimized,
    text: comment.text
  };
}
function normalizeCostume(costume, index) {
  return {
    name: costume.name,
    semanticId: `costume_${index}_${costume.name.replace(/\s+/g, "_").toLowerCase()}`,
    bitmapResolution: costume.bitmapResolution,
    dataFormat: costume.dataFormat,
    assetId: costume.assetId,
    md5ext: costume.md5ext,
    rotationCenterX: costume.rotationCenterX,
    rotationCenterY: costume.rotationCenterY
  };
}
function normalizeSound(sound, index) {
  return {
    name: sound.name,
    semanticId: `sound_${index}_${sound.name.replace(/\s+/g, "_").toLowerCase()}`,
    dataFormat: sound.dataFormat,
    assetId: sound.assetId,
    md5ext: sound.md5ext,
    rate: sound.rate,
    sampleCount: sound.sampleCount
  };
}
function normalizeMonitor(monitor) {
  return {
    id: monitor.id,
    semanticId: `monitor_${monitor.id}`,
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
  };
}
function normalizeExtension(ext) {
  return {
    name: ext.name,
    version: ext.version
  };
}
function normalizeMeta(meta) {
  return {
    semver: meta.semver,
    vm: meta.vm,
    agent: meta.agent
  };
}

// src/codec/expand.ts
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
var __dirname = dirname(fileURLToPath(import.meta.url));
async function expandToFiles(project, outputDir) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "project.json"), JSON.stringify(project, null, 2));
  for (const target of project.targets) {
    const targetDir = join(outputDir, "targets", sanitizeFilename(target.semanticId));
    await mkdir(targetDir, { recursive: true });
    const scriptsDir = join(targetDir, "scripts");
    await mkdir(scriptsDir, { recursive: true });
    for (const script of target.scripts) {
      const scriptFile = join(scriptsDir, `${script.semanticId}.json`);
      await writeFile(scriptFile, JSON.stringify(script, null, 2));
    }
    if (target.comments.length > 0) {
      await writeFile(join(targetDir, "comments.json"), JSON.stringify(target.comments, null, 2));
    }
    if (target.costumes.length > 0) {
      await writeFile(join(targetDir, "costumes.json"), JSON.stringify(target.costumes, null, 2));
    }
    if (target.sounds.length > 0) {
      await writeFile(join(targetDir, "sounds.json"), JSON.stringify(target.sounds, null, 2));
    }
  }
  if (project.monitors.length > 0) {
    await writeFile(join(outputDir, "monitors.json"), JSON.stringify(project.monitors, null, 2));
  }
  if (project.extensions.length > 0) {
    await writeFile(join(outputDir, "extensions.json"), JSON.stringify(project.extensions, null, 2));
  }
}
async function collapseFromFiles(inputDir) {
  const projectPath = join(inputDir, "project.json");
  const projectJson = await readFile(projectPath, "utf-8");
  const project = JSON.parse(projectJson);
  const targetsDir = join(inputDir, "targets");
  try {
    const targetDirs = await readDir(targetsDir);
    for (const targetDir of targetDirs) {
      const target = project.targets.find((t) => t.semanticId === targetDir);
      if (!target) continue;
      const scriptsDir = join(targetsDir, targetDir, "scripts");
      try {
        const scriptFiles = await readDir(scriptsDir);
        for (const scriptFile of scriptFiles) {
          if (scriptFile.endsWith(".json")) {
            const scriptPath = join(scriptsDir, scriptFile);
            const scriptJson = await readFile(scriptPath, "utf-8");
            const script = JSON.parse(scriptJson);
            const existingIndex = target.scripts.findIndex((s) => s.semanticId === script.semanticId);
            if (existingIndex >= 0) {
              target.scripts[existingIndex] = script;
            } else {
              target.scripts.push(script);
            }
          }
        }
      } catch {
      }
      const commentsPath = join(targetsDir, targetDir, "comments.json");
      try {
        const commentsJson = await readFile(commentsPath, "utf-8");
        target.comments = JSON.parse(commentsJson);
      } catch {
      }
      const costumesPath = join(targetsDir, targetDir, "costumes.json");
      try {
        const costumesJson = await readFile(costumesPath, "utf-8");
        target.costumes = JSON.parse(costumesJson);
      } catch {
      }
      const soundsPath = join(targetsDir, targetDir, "sounds.json");
      try {
        const soundsJson = await readFile(soundsPath, "utf-8");
        target.sounds = JSON.parse(soundsJson);
      } catch {
      }
    }
  } catch {
  }
  const monitorsPath = join(inputDir, "monitors.json");
  try {
    const monitorsJson = await readFile(monitorsPath, "utf-8");
    project.monitors = JSON.parse(monitorsJson);
  } catch {
  }
  const extensionsPath = join(inputDir, "extensions.json");
  try {
    const extensionsJson = await readFile(extensionsPath, "utf-8");
    project.extensions = JSON.parse(extensionsJson);
  } catch {
  }
  return project;
}
async function readDir(dir) {
  const { readdir } = await import("fs/promises");
  return readdir(dir);
}
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}
async function extractAssetsToFiles(assets, outputDir) {
  const assetsDir = join(outputDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  const costumesDir = join(assetsDir, "costumes");
  const soundsDir = join(assetsDir, "sounds");
  await mkdir(costumesDir, { recursive: true });
  await mkdir(soundsDir, { recursive: true });
  for (const [filename, data] of assets) {
    const ext = filename.split(".").pop()?.toLowerCase();
    const isImage = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext || "");
    const targetDir = isImage ? costumesDir : soundsDir;
    await writeFile(join(targetDir, filename), data);
  }
}
async function collectAssetsFromFiles(inputDir) {
  const assets = /* @__PURE__ */ new Map();
  const assetsDir = join(inputDir, "assets");
  try {
    const { readdir } = await import("fs/promises");
    const [costumesDir, soundsDir] = [join(assetsDir, "costumes"), join(assetsDir, "sounds")];
    for (const dir of [costumesDir, soundsDir]) {
      try {
        const files = await readdir(dir);
        for (const file of files) {
          const filePath = join(dir, file);
          const { stat } = await import("fs/promises");
          const stats = await stat(filePath);
          if (stats.isFile()) {
            const data = await readFile(filePath);
            assets.set(file, data);
          }
        }
      } catch {
      }
    }
  } catch {
  }
  return assets;
}

// src/algo/id-assign.ts
import { createHash as createHash2 } from "crypto";
function assignSemanticIds2(project) {
  const cloned = JSON.parse(JSON.stringify(project));
  for (let targetIndex = 0; targetIndex < cloned.targets.length; targetIndex++) {
    const target = cloned.targets[targetIndex];
    if (!target) continue;
    target.semanticId = `target_${targetIndex}_${sanitize(target.name)}`;
    for (let scriptIndex = 0; scriptIndex < target.scripts.length; scriptIndex++) {
      const script = target.scripts[scriptIndex];
      if (!script) continue;
      script.semanticId = `script_${targetIndex}_${scriptIndex}`;
      for (let blockIndex = 0; blockIndex < script.blocks.length; blockIndex++) {
        const block = script.blocks[blockIndex];
        if (!block) continue;
        block.semanticId = `script_${targetIndex}_${scriptIndex}_block_${blockIndex}`;
      }
    }
    for (let i = 0; i < target.costumes.length; i++) {
      const costume = target.costumes[i];
      if (costume) {
        costume.semanticId = `costume_${targetIndex}_${i}_${sanitize(costume.name)}`;
      }
    }
    for (let i = 0; i < target.sounds.length; i++) {
      const sound = target.sounds[i];
      if (sound) {
        sound.semanticId = `sound_${targetIndex}_${i}_${sanitize(sound.name)}`;
      }
    }
    for (const comment of target.comments) {
      if (comment.blockSemanticId) {
        const block = findBlockByOldId(cloned, comment.blockSemanticId);
        if (block) {
          comment.blockSemanticId = block.semanticId;
        }
      }
    }
  }
  for (let i = 0; i < cloned.monitors.length; i++) {
    const monitor = cloned.monitors[i];
    if (monitor) {
      monitor.semanticId = `monitor_${i}`;
    }
  }
  return cloned;
}
function findBlockByOldId(project, oldId) {
  for (const target of project.targets) {
    for (const script of target.scripts) {
      const block = script.blocks.find((b) => b.id === oldId);
      if (block) return block;
    }
  }
  return null;
}
function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}
function topologicalSortBlocks(blocks) {
  const graph = /* @__PURE__ */ new Map();
  const inDegree = /* @__PURE__ */ new Map();
  const blockMap = /* @__PURE__ */ new Map();
  for (const block of blocks) {
    blockMap.set(block.semanticId, block);
    graph.set(block.semanticId, /* @__PURE__ */ new Set());
    inDegree.set(block.semanticId, 0);
  }
  for (const block of blocks) {
    if (block.parent) {
      const parentId = block.parent;
      const parent = Array.from(blockMap.values()).find((b) => b.id === parentId || b.semanticId === parentId);
      if (parent) {
        graph.get(parent.semanticId).add(block.semanticId);
        inDegree.set(block.semanticId, (inDegree.get(block.semanticId) || 0) + 1);
      }
    }
    if (block.next) {
      const nextId = block.next;
      const next = Array.from(blockMap.values()).find((b) => b.id === nextId || b.semanticId === nextId);
      if (next) {
        graph.get(block.semanticId).add(next.semanticId);
        inDegree.set(next.semanticId, (inDegree.get(next.semanticId) || 0) + 1);
      }
    }
  }
  const queue = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }
  const sorted = [];
  while (queue.length > 0) {
    const id = queue.shift();
    const block = blockMap.get(id);
    sorted.push(block);
    for (const neighbor of graph.get(id) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }
  return sorted;
}
function computeBlockContentHash2(block) {
  const hash = createHash2("sha256");
  hash.update(block.opcode);
  for (const [key, input] of Object.entries(block.inputs).sort()) {
    hash.update(key);
    hash.update(String(input[0]));
    if (typeof input[1] !== "object" || input[1] === null || Array.isArray(input[1])) {
      hash.update(JSON.stringify(input[1]));
    }
  }
  for (const [key, field] of Object.entries(block.fields).sort()) {
    hash.update(key);
    hash.update(field[0]);
    hash.update(field[1]);
  }
  hash.update(String(block.shadow));
  return hash.digest("hex").slice(0, 16);
}

// src/algo/diff.ts
function diffProjects(base, modified) {
  return {
    targets: diffTargets(base.targets, modified.targets),
    monitors: diffMonitors(base.monitors, modified.monitors),
    extensions: diffExtensions(base.extensions, modified.extensions)
  };
}
function diffTargets(baseTargets, newTargets) {
  const result = [];
  const baseMap = new Map(baseTargets.map((t) => [t.semanticId, t]));
  const newMap = new Map(newTargets.map((t) => [t.semanticId, t]));
  const allIds = /* @__PURE__ */ new Set([...baseMap.keys(), ...newMap.keys()]);
  for (const id of allIds) {
    const base = baseMap.get(id);
    const newTarget = newMap.get(id);
    if (base && newTarget) {
      result.push({
        semanticId: id,
        name: newTarget.name,
        scripts: diffScripts(base.scripts, newTarget.scripts),
        comments: diffComments(base.comments, newTarget.comments),
        costumes: diffAssets(base.costumes, newTarget.costumes),
        sounds: diffAssets(base.sounds, newTarget.sounds),
        properties: diffTargetProperties(base, newTarget)
      });
    } else if (base && !newTarget) {
      result.push({
        semanticId: id,
        name: base.name,
        scripts: base.scripts.map((s) => ({ semanticId: s.semanticId, blocks: s.blocks.map((b) => ({ semanticId: b.semanticId, type: "removed", baseBlock: b })) })),
        comments: base.comments.map((c) => ({ id: c.id, type: "removed", oldComment: { text: c.text, x: c.x, y: c.y } })),
        costumes: base.costumes.map((c) => ({ semanticId: c.semanticId, name: c.name, type: "removed" })),
        sounds: base.sounds.map((s) => ({ semanticId: s.semanticId, name: s.name, type: "removed" })),
        properties: []
      });
    } else if (!base && newTarget) {
      result.push({
        semanticId: id,
        name: newTarget.name,
        scripts: newTarget.scripts.map((s) => ({ semanticId: s.semanticId, blocks: s.blocks.map((b) => ({ semanticId: b.semanticId, type: "added", newBlock: b })) })),
        comments: newTarget.comments.map((c) => ({ id: c.id, type: "added", newComment: { text: c.text, x: c.x, y: c.y } })),
        costumes: newTarget.costumes.map((c) => ({ semanticId: c.semanticId, name: c.name, type: "added" })),
        sounds: newTarget.sounds.map((s) => ({ semanticId: s.semanticId, name: s.name, type: "added" })),
        properties: []
      });
    }
  }
  return result;
}
function diffScripts(baseScripts, newScripts) {
  const result = [];
  const baseMap = new Map(baseScripts.map((s) => [s.semanticId, s]));
  const newMap = new Map(newScripts.map((s) => [s.semanticId, s]));
  const allIds = /* @__PURE__ */ new Set([...baseMap.keys(), ...newMap.keys()]);
  for (const id of allIds) {
    const base = baseMap.get(id);
    const newScript = newMap.get(id);
    if (base && newScript) {
      result.push({
        semanticId: id,
        blocks: diffBlocks(base.blocks, newScript.blocks)
      });
    } else if (base && !newScript) {
      result.push({
        semanticId: id,
        blocks: base.blocks.map((b) => ({ semanticId: b.semanticId, type: "removed", baseBlock: b }))
      });
    } else if (!base && newScript) {
      result.push({
        semanticId: id,
        blocks: newScript.blocks.map((b) => ({ semanticId: b.semanticId, type: "added", newBlock: b }))
      });
    }
  }
  return result;
}
function diffBlocks(baseBlocks, newBlocks) {
  const result = [];
  const baseMap = new Map(baseBlocks.map((b) => [b.semanticId, b]));
  const newMap = new Map(newBlocks.map((b) => [b.semanticId, b]));
  const allIds = /* @__PURE__ */ new Set([...baseMap.keys(), ...newMap.keys()]);
  for (const id of allIds) {
    const base = baseMap.get(id);
    const newBlock = newMap.get(id);
    if (base && newBlock) {
      if (blocksEqual(base, newBlock)) {
        result.push({ semanticId: id, type: "unchanged", baseBlock: base, newBlock });
      } else {
        result.push({
          semanticId: id,
          type: "modified",
          baseBlock: base,
          newBlock,
          changes: diffBlockFields(base, newBlock)
        });
      }
      baseMap.delete(id);
      newMap.delete(id);
    }
  }
  for (const [id, base] of baseMap) {
    let matched = false;
    for (const [newId, newBlock] of newMap) {
      if (base.contentHash === newBlock.contentHash) {
        result.push({
          semanticId: newId,
          type: "modified",
          baseBlock: base,
          newBlock,
          changes: [{ field: "position", oldValue: base.semanticId, newValue: newBlock.semanticId }]
        });
        newMap.delete(newId);
        matched = true;
        break;
      }
    }
    if (!matched) {
      result.push({ semanticId: id, type: "removed", baseBlock: base });
    }
  }
  for (const [id, newBlock] of newMap) {
    result.push({ semanticId: id, type: "added", newBlock });
  }
  return result;
}
function blocksEqual(a, b) {
  return a.opcode === b.opcode && a.next === b.next && a.parent === b.parent && a.shadow === b.shadow && a.topLevel === b.topLevel && a.x === b.x && a.y === b.y && JSON.stringify(a.inputs) === JSON.stringify(b.inputs) && JSON.stringify(a.fields) === JSON.stringify(b.fields);
}
function diffBlockFields(base, newBlock) {
  const changes = [];
  const allFields = /* @__PURE__ */ new Set([
    ...Object.keys(base.inputs),
    ...Object.keys(newBlock.inputs),
    ...Object.keys(base.fields),
    ...Object.keys(newBlock.fields)
  ]);
  for (const field of allFields) {
    const baseVal = base.inputs[field] ?? base.fields[field];
    const newVal = newBlock.inputs[field] ?? newBlock.fields[field];
    if (JSON.stringify(baseVal) !== JSON.stringify(newVal)) {
      changes.push({ field, oldValue: baseVal, newValue: newVal });
    }
  }
  if (base.opcode !== newBlock.opcode) {
    changes.push({ field: "opcode", oldValue: base.opcode, newValue: newBlock.opcode });
  }
  if (base.next !== newBlock.next) {
    changes.push({ field: "next", oldValue: base.next, newValue: newBlock.next });
  }
  if (base.parent !== newBlock.parent) {
    changes.push({ field: "parent", oldValue: base.parent, newValue: newBlock.parent });
  }
  if (base.shadow !== newBlock.shadow) {
    changes.push({ field: "shadow", oldValue: base.shadow, newValue: newBlock.shadow });
  }
  if (base.x !== newBlock.x || base.y !== newBlock.y) {
    changes.push({ field: "position", oldValue: { x: base.x, y: base.y }, newValue: { x: newBlock.x, y: newBlock.y } });
  }
  return changes;
}
function diffComments(base, newComments) {
  const result = [];
  const baseMap = new Map(base.map((c) => [c.id, c]));
  const newMap = new Map(newComments.map((c) => [c.id, c]));
  const allIds = /* @__PURE__ */ new Set([...baseMap.keys(), ...newMap.keys()]);
  for (const id of allIds) {
    const baseComment = baseMap.get(id);
    const newComment = newMap.get(id);
    if (baseComment && newComment) {
      if (baseComment.text === newComment.text && baseComment.x === newComment.x && baseComment.y === newComment.y) {
        result.push({ id, type: "unchanged" });
      } else {
        result.push({
          id,
          type: "modified",
          oldComment: { text: baseComment.text, x: baseComment.x, y: baseComment.y },
          newComment: { text: newComment.text, x: newComment.x, y: newComment.y }
        });
      }
    } else if (baseComment && !newComment) {
      result.push({ id, type: "removed", oldComment: { text: baseComment.text, x: baseComment.x, y: baseComment.y } });
    } else if (!baseComment && newComment) {
      result.push({ id, type: "added", newComment: { text: newComment.text, x: newComment.x, y: newComment.y } });
    }
  }
  return result;
}
function diffAssets(base, newAssets) {
  const result = [];
  const baseMap = new Map(base.map((a) => [a.semanticId, a]));
  const newMap = new Map(newAssets.map((a) => [a.semanticId, a]));
  const allIds = /* @__PURE__ */ new Set([...baseMap.keys(), ...newMap.keys()]);
  for (const id of allIds) {
    const baseAsset = baseMap.get(id);
    const newAsset = newMap.get(id);
    if (baseAsset && newAsset) {
      if (baseAsset.md5ext === newAsset.md5ext) {
        result.push({ semanticId: id, name: newAsset.name, type: "unchanged" });
      } else {
        result.push({ semanticId: id, name: newAsset.name, type: "modified", oldMd5: baseAsset.md5ext, newMd5: newAsset.md5ext });
      }
    } else if (baseAsset && !newAsset) {
      result.push({ semanticId: id, name: baseAsset.name, type: "removed" });
    } else if (!baseAsset && newAsset) {
      result.push({ semanticId: id, name: newAsset.name, type: "added" });
    }
  }
  return result;
}
function diffTargetProperties(base, newTarget) {
  const changes = [];
  const props = ["currentCostume", "volume", "layerOrder", "tempo", "videoTransparency", "videoState", "textToSpeechLanguage", "x", "y", "size", "direction", "draggable", "rotationStyle", "visible"];
  for (const prop of props) {
    const baseVal = base[prop];
    const newVal = newTarget[prop];
    if (JSON.stringify(baseVal) !== JSON.stringify(newVal)) {
      changes.push({ property: prop, oldValue: baseVal, newValue: newVal });
    }
  }
  return changes;
}
function diffMonitors(base, newMonitors) {
  const result = [];
  const baseMap = new Map(base.map((m) => [m.semanticId, m]));
  const newMap = new Map(newMonitors.map((m) => [m.semanticId, m]));
  const allIds = /* @__PURE__ */ new Set([...baseMap.keys(), ...newMap.keys()]);
  for (const id of allIds) {
    const baseMonitor = baseMap.get(id);
    const newMonitor = newMap.get(id);
    if (baseMonitor && newMonitor) {
      const changes = diffBlockFields(baseMonitor, newMonitor);
      if (changes.length === 0) {
        result.push({ semanticId: id, type: "unchanged" });
      } else {
        result.push({ semanticId: id, type: "modified", changes });
      }
    } else if (baseMonitor && !newMonitor) {
      result.push({ semanticId: id, type: "removed" });
    } else if (!baseMonitor && newMonitor) {
      result.push({ semanticId: id, type: "added" });
    }
  }
  return result;
}
function diffExtensions(base, newExtensions) {
  const result = [];
  const baseMap = new Map(base.map((e) => [e.name, e]));
  const newMap = new Map(newExtensions.map((e) => [e.name, e]));
  const allNames = /* @__PURE__ */ new Set([...baseMap.keys(), ...newMap.keys()]);
  for (const name of allNames) {
    const baseExt = baseMap.get(name);
    const newExt = newMap.get(name);
    if (baseExt && newExt) {
      if (baseExt.version === newExt.version) {
        result.push({ name, type: "unchanged" });
      } else {
        result.push({ name, type: "modified", oldVersion: baseExt.version, newVersion: newExt.version });
      }
    } else if (baseExt && !newExt) {
      result.push({ name, type: "removed" });
    } else if (!baseExt && newExt) {
      result.push({ name, type: "added", newVersion: newExt.version });
    }
  }
  return result;
}

// src/algo/three-way-merge.ts
import { createHash as createHash3 } from "crypto";
function threeWayMerge(base, ours, theirs, options = {}) {
  const conflicts = [];
  const autoResolve = options.autoResolve ?? false;
  const mergedTargets = mergeTargets(base.targets, ours.targets, theirs.targets, conflicts, autoResolve);
  const mergedMonitors = mergeMonitors(base.monitors, ours.monitors, theirs.monitors, conflicts, autoResolve);
  const mergedExtensions = mergeExtensions(base.extensions, ours.extensions, theirs.extensions, conflicts, autoResolve);
  const mergedMeta = ours.meta;
  const mergedProject = {
    targets: mergedTargets,
    monitors: mergedMonitors,
    extensions: mergedExtensions,
    meta: mergedMeta
  };
  const finalProject = reassignSemanticIds(mergedProject);
  return { project: finalProject, conflicts };
}
function mergeTargets(baseTargets, ourTargets, theirTargets, conflicts, autoResolve) {
  const baseMap = new Map(baseTargets.map((t) => [t.semanticId, t]));
  const ourMap = new Map(ourTargets.map((t) => [t.semanticId, t]));
  const theirMap = new Map(theirTargets.map((t) => [t.semanticId, t]));
  const allIds = /* @__PURE__ */ new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()]);
  const result = [];
  for (const id of allIds) {
    const base = baseMap.get(id);
    const ours = ourMap.get(id);
    const theirs = theirMap.get(id);
    if (base && ours && theirs) {
      result.push(mergeTarget(base, ours, theirs, conflicts, autoResolve));
    } else if (base && ours && !theirs) {
      result.push(ours);
    } else if (base && !ours && theirs) {
      result.push(theirs);
    } else if (!base && ours && theirs) {
      const conflict = {
        type: "target",
        path: id,
        base: void 0,
        ours: ours.name,
        theirs: theirs.name,
        message: `Target added in both branches with different content: ${ours.name} vs ${theirs.name}`,
        autoResolved: false
      };
      conflicts.push(conflict);
      if (autoResolve) {
        conflict.autoResolved = true;
        conflict.resolution = "ours";
        result.push(ours);
      } else {
        result.push(ours);
      }
    } else if (base && !ours && !theirs) {
    } else if (!base && ours && !theirs) {
      result.push(ours);
    } else if (!base && !ours && theirs) {
      result.push(theirs);
    }
  }
  return result;
}
function mergeTarget(base, ours, theirs, conflicts, autoResolve) {
  const mergedProps = mergeProperties(base, ours, theirs, `target.${base.semanticId}`, conflicts, autoResolve);
  const mergedScripts = mergeScripts(base.scripts, ours.scripts, theirs.scripts, conflicts, autoResolve);
  const mergedComments = mergeComments(base.comments, ours.comments, theirs.comments, conflicts, autoResolve);
  const mergedCostumes = mergeCostumes(base.costumes, ours.costumes, theirs.costumes, conflicts, autoResolve);
  const mergedSounds = mergeSounds(base.sounds, ours.sounds, theirs.sounds, conflicts, autoResolve);
  const result = {
    name: mergedProps.name ?? ours.name,
    semanticId: ours.semanticId,
    variables: mergedProps.variables ?? ours.variables,
    lists: mergedProps.lists ?? ours.lists,
    broadcasts: mergedProps.broadcasts ?? ours.broadcasts,
    scripts: mergedScripts,
    comments: mergedComments,
    costumes: mergedCostumes,
    sounds: mergedSounds,
    currentCostume: mergedProps.currentCostume ?? ours.currentCostume,
    volume: mergedProps.volume ?? ours.volume,
    layerOrder: mergedProps.layerOrder ?? ours.layerOrder,
    tempo: mergedProps.tempo ?? ours.tempo,
    videoTransparency: mergedProps.videoTransparency ?? ours.videoTransparency,
    videoState: mergedProps.videoState ?? ours.videoState,
    textToSpeechLanguage: mergedProps.textToSpeechLanguage ?? ours.textToSpeechLanguage,
    x: mergedProps.x ?? ours.x,
    y: mergedProps.y ?? ours.y,
    size: mergedProps.size ?? ours.size,
    direction: mergedProps.direction ?? ours.direction,
    draggable: mergedProps.draggable ?? ours.draggable,
    rotationStyle: mergedProps.rotationStyle ?? ours.rotationStyle,
    visible: mergedProps.visible ?? ours.visible
  };
  return result;
}
function mergeProperties(base, ours, theirs, path, conflicts, autoResolve) {
  const result = {};
  const props = ["name", "variables", "lists", "broadcasts", "currentCostume", "volume", "layerOrder", "tempo", "videoTransparency", "videoState", "textToSpeechLanguage", "x", "y", "size", "direction", "draggable", "rotationStyle", "visible"];
  for (const prop of props) {
    const baseVal = base[prop];
    const ourVal = ours[prop];
    const theirVal = theirs[prop];
    const merged = mergeProperty(baseVal, ourVal, theirVal, `${path}.${String(prop)}`, conflicts, autoResolve);
    if (merged !== void 0) {
      result[prop] = merged;
    }
  }
  return result;
}
function mergeProperty(base, ours, theirs, path, conflicts, autoResolve) {
  const baseStr = JSON.stringify(base);
  const ourStr = JSON.stringify(ours);
  const theirStr = JSON.stringify(theirs);
  if (ourStr === theirStr) {
    return ours;
  }
  if (ourStr === baseStr) {
    return theirs;
  }
  if (theirStr === baseStr) {
    return ours;
  }
  const conflict = {
    type: "property",
    path,
    base,
    ours,
    theirs,
    message: `Property conflict at ${path}: ours=${ourStr}, theirs=${theirStr}`,
    autoResolved: false
  };
  conflicts.push(conflict);
  if (autoResolve) {
    conflict.autoResolved = true;
    conflict.resolution = "ours";
    return ours;
  }
  return ours;
}
function mergeScripts(baseScripts, ourScripts, theirScripts, conflicts, autoResolve) {
  const baseMap = new Map(baseScripts.map((s) => [s.semanticId, s]));
  const ourMap = new Map(ourScripts.map((s) => [s.semanticId, s]));
  const theirMap = new Map(theirScripts.map((s) => [s.semanticId, s]));
  const allIds = /* @__PURE__ */ new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()]);
  const result = [];
  for (const id of allIds) {
    const base = baseMap.get(id);
    const ours = ourMap.get(id);
    const theirs = theirMap.get(id);
    if (base && ours && theirs) {
      const mergedScript = mergeScript(base, ours, theirs, conflicts, autoResolve);
      if (mergedScript) result.push(mergedScript);
    } else if (base && ours && !theirs) {
      result.push(ours);
    } else if (base && !ours && theirs) {
      result.push(theirs);
    } else if (!base && ours && theirs) {
      const conflict = {
        type: "script",
        path: id,
        base: void 0,
        ours: ours.semanticId,
        theirs: theirs.semanticId,
        message: `Script added in both branches: ${id}`,
        autoResolved: false
      };
      conflicts.push(conflict);
      if (autoResolve) {
        conflict.autoResolved = true;
        conflict.resolution = "ours";
        result.push(ours);
      } else {
        result.push(ours);
      }
    } else if (!base && ours && !theirs) {
      result.push(ours);
    } else if (!base && !ours && theirs) {
      result.push(theirs);
    }
  }
  return result;
}
function mergeScript(base, ours, theirs, conflicts, autoResolve) {
  const mergedBlocks = mergeBlocks(base.blocks, ours.blocks, theirs.blocks, conflicts, autoResolve);
  return {
    semanticId: base.semanticId,
    blocks: mergedBlocks
  };
}
function mergeBlocks(baseBlocks, ourBlocks, theirBlocks, conflicts, autoResolve) {
  const baseMap = new Map(baseBlocks.map((b) => [b.semanticId, b]));
  const ourMap = new Map(ourBlocks.map((b) => [b.semanticId, b]));
  const theirMap = new Map(theirBlocks.map((b) => [b.semanticId, b]));
  const allIds = /* @__PURE__ */ new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()]);
  const result = [];
  for (const id of allIds) {
    const base = baseMap.get(id);
    const ours = ourMap.get(id);
    const theirs = theirMap.get(id);
    if (base && ours && theirs) {
      const merged = mergeBlock(base, ours, theirs, conflicts, autoResolve);
      if (merged) result.push(merged);
    } else if (base && ours && !theirs) {
      result.push(ours);
    } else if (base && !ours && theirs) {
      result.push(theirs);
    } else if (!base && ours && theirs) {
      const conflict = {
        type: "block",
        path: id,
        base: void 0,
        ours: ours.opcode,
        theirs: theirs.opcode,
        message: `Block added in both branches with different opcodes: ${ours.opcode} vs ${theirs.opcode}`,
        autoResolved: false
      };
      conflicts.push(conflict);
      if (autoResolve) {
        conflict.autoResolved = true;
        conflict.resolution = "ours";
        result.push(ours);
      } else {
        result.push(ours);
      }
    } else if (!base && ours && !theirs) {
      result.push(ours);
    } else if (!base && !ours && theirs) {
      result.push(theirs);
    }
  }
  return result;
}
function mergeBlock(base, ours, theirs, conflicts, autoResolve) {
  const baseHash = computeBlockContentHash3(base);
  const ourHash = computeBlockContentHash3(ours);
  const theirHash = computeBlockContentHash3(theirs);
  if (ourHash === theirHash) {
    return ours;
  }
  if (ourHash === baseHash) {
    return theirs;
  }
  if (theirHash === baseHash) {
    return ours;
  }
  const conflict = {
    type: "block",
    path: base.semanticId,
    base: { opcode: base.opcode, inputs: base.inputs, fields: base.fields },
    ours: { opcode: ours.opcode, inputs: ours.inputs, fields: ours.fields },
    theirs: { opcode: theirs.opcode, inputs: theirs.inputs, fields: theirs.fields },
    message: `Block modified in both branches: ${base.semanticId}`,
    autoResolved: false
  };
  conflicts.push(conflict);
  if (autoResolve) {
    conflict.autoResolved = true;
    conflict.resolution = "ours";
    return ours;
  }
  return ours;
}
function mergeComments(base, ours, theirs, conflicts, autoResolve) {
  const baseMap = new Map(base.map((c) => [c.id, c]));
  const ourMap = new Map(ours.map((c) => [c.id, c]));
  const theirMap = new Map(theirs.map((c) => [c.id, c]));
  const allIds = /* @__PURE__ */ new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()]);
  const result = [];
  for (const id of allIds) {
    const baseComment = baseMap.get(id);
    const ourComment = ourMap.get(id);
    const theirComment = theirMap.get(id);
    if (baseComment && ourComment && theirComment) {
      const merged = mergeComment(baseComment, ourComment, theirComment, conflicts, autoResolve);
      if (merged) result.push(merged);
    } else if (baseComment && ourComment && !theirComment) {
      result.push(ourComment);
    } else if (baseComment && !ourComment && theirComment) {
      result.push(theirComment);
    } else if (!baseComment && ourComment && theirComment) {
      const conflict = {
        type: "comment",
        path: id,
        base: void 0,
        ours: ourComment.text,
        theirs: theirComment.text,
        message: `Comment added in both branches: ${id}`,
        autoResolved: false
      };
      conflicts.push(conflict);
      if (autoResolve) {
        conflict.autoResolved = true;
        conflict.resolution = "ours";
        result.push(ourComment);
      } else {
        result.push(ourComment);
      }
    } else if (!baseComment && ourComment && !theirComment) {
      result.push(ourComment);
    } else if (!baseComment && !ourComment && theirComment) {
      result.push(theirComment);
    }
  }
  return result;
}
function mergeComment(base, ours, theirs, conflicts, autoResolve) {
  const baseStr = JSON.stringify({ text: base.text, x: base.x, y: base.y });
  const ourStr = JSON.stringify({ text: ours.text, x: ours.x, y: ours.y });
  const theirStr = JSON.stringify({ text: theirs.text, x: theirs.x, y: theirs.y });
  if (ourStr === theirStr) return ours;
  if (ourStr === baseStr) return theirs;
  if (theirStr === baseStr) return ours;
  const conflict = {
    type: "comment",
    path: base.id,
    base: { text: base.text, x: base.x, y: base.y },
    ours: { text: ours.text, x: ours.x, y: ours.y },
    theirs: { text: theirs.text, x: theirs.x, y: theirs.y },
    message: `Comment modified in both branches: ${base.id}`,
    autoResolved: false
  };
  conflicts.push(conflict);
  if (autoResolve) {
    conflict.autoResolved = true;
    conflict.resolution = "ours";
    return ours;
  }
  return ours;
}
function mergeCostumes(base, ours, theirs, conflicts, autoResolve) {
  return mergeAssets(base, ours, theirs, "costume", conflicts, autoResolve);
}
function mergeSounds(base, ours, theirs, conflicts, autoResolve) {
  return mergeAssets(base, ours, theirs, "sound", conflicts, autoResolve);
}
function mergeAssets(base, ours, theirs, type, conflicts, autoResolve) {
  const baseMap = new Map(base.map((a) => [a.semanticId, a]));
  const ourMap = new Map(ours.map((a) => [a.semanticId, a]));
  const theirMap = new Map(theirs.map((a) => [a.semanticId, a]));
  const allIds = /* @__PURE__ */ new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()]);
  const result = [];
  for (const id of allIds) {
    const baseAsset = baseMap.get(id);
    const ourAsset = ourMap.get(id);
    const theirAsset = theirMap.get(id);
    if (baseAsset && ourAsset && theirAsset) {
      if (ourAsset.md5ext === theirAsset.md5ext) {
        result.push(ourAsset);
      } else if (ourAsset.md5ext === baseAsset.md5ext) {
        result.push(theirAsset);
      } else if (theirAsset.md5ext === baseAsset.md5ext) {
        result.push(ourAsset);
      } else {
        const conflict = {
          type,
          path: id,
          base: baseAsset.md5ext,
          ours: ourAsset.md5ext,
          theirs: theirAsset.md5ext,
          message: `${type} modified in both branches: ${id}`,
          autoResolved: false
        };
        conflicts.push(conflict);
        if (autoResolve) {
          conflict.autoResolved = true;
          conflict.resolution = "ours";
          result.push(ourAsset);
        } else {
          result.push(ourAsset);
        }
      }
    } else if (baseAsset && ourAsset && !theirAsset) {
      result.push(ourAsset);
    } else if (baseAsset && !ourAsset && theirAsset) {
      result.push(theirAsset);
    } else if (!baseAsset && ourAsset && theirAsset) {
      const conflict = {
        type,
        path: id,
        base: void 0,
        ours: ourAsset.md5ext,
        theirs: theirAsset.md5ext,
        message: `${type} added in both branches: ${id}`,
        autoResolved: false
      };
      conflicts.push(conflict);
      if (autoResolve) {
        conflict.autoResolved = true;
        conflict.resolution = "ours";
        result.push(ourAsset);
      } else {
        result.push(ourAsset);
      }
    } else if (!baseAsset && ourAsset && !theirAsset) {
      result.push(ourAsset);
    } else if (!baseAsset && !ourAsset && theirAsset) {
      result.push(theirAsset);
    }
  }
  return result;
}
function mergeMonitors(base, ours, theirs, conflicts, autoResolve) {
  const baseMap = new Map(base.map((m) => [m.semanticId, m]));
  const ourMap = new Map(ours.map((m) => [m.semanticId, m]));
  const theirMap = new Map(theirs.map((m) => [m.semanticId, m]));
  const allIds = /* @__PURE__ */ new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()]);
  const result = [];
  for (const id of allIds) {
    const baseMon = baseMap.get(id);
    const ourMon = ourMap.get(id);
    const theirMon = theirMap.get(id);
    if (baseMon && ourMon && theirMon) {
      result.push({
        ...ourMon,
        ...theirMon
      });
    } else if (baseMon && ourMon && !theirMon) {
      result.push(ourMon);
    } else if (baseMon && !ourMon && theirMon) {
      result.push(theirMon);
    } else if (!baseMon && ourMon && theirMon) {
      result.push(ourMon);
    } else if (!baseMon && ourMon && !theirMon) {
      result.push(ourMon);
    } else if (!baseMon && !ourMon && theirMon) {
      result.push(theirMon);
    }
  }
  return result;
}
function mergeExtensions(base, ours, theirs, conflicts, autoResolve) {
  const baseMap = new Map(base.map((e) => [e.name, e]));
  const ourMap = new Map(ours.map((e) => [e.name, e]));
  const theirMap = new Map(theirs.map((e) => [e.name, e]));
  const allNames = /* @__PURE__ */ new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()]);
  const result = [];
  for (const name of allNames) {
    const baseExt = baseMap.get(name);
    const ourExt = ourMap.get(name);
    const theirExt = theirMap.get(name);
    if (baseExt && ourExt && theirExt) {
      if (ourExt.version === theirExt.version) {
        result.push(ourExt);
      } else if (ourExt.version === baseExt.version) {
        result.push(theirExt);
      } else if (theirExt.version === baseExt.version) {
        result.push(ourExt);
      } else {
        const conflict = {
          type: "property",
          path: `extension.${name}`,
          base: baseExt.version,
          ours: ourExt.version,
          theirs: theirExt.version,
          message: `Extension version conflict: ${name}`,
          autoResolved: false
        };
        conflicts.push(conflict);
        if (autoResolve) {
          conflict.autoResolved = true;
          conflict.resolution = "ours";
          result.push(ourExt);
        } else {
          result.push(ourExt);
        }
      }
    } else if (ourExt && !theirExt) {
      result.push(ourExt);
    } else if (!ourExt && theirExt) {
      result.push(theirExt);
    }
  }
  return result;
}
function reassignSemanticIds(project) {
  const cloned = JSON.parse(JSON.stringify(project));
  let targetIndex = 0;
  for (const target of cloned.targets) {
    target.semanticId = `target_${targetIndex}_${sanitize2(target.name)}`;
    for (let scriptIndex = 0; scriptIndex < target.scripts.length; scriptIndex++) {
      const script = target.scripts[scriptIndex];
      if (!script) continue;
      script.semanticId = `script_${targetIndex}_${scriptIndex}`;
      for (let blockIndex = 0; blockIndex < script.blocks.length; blockIndex++) {
        const block = script.blocks[blockIndex];
        if (block) {
          block.semanticId = `script_${targetIndex}_${scriptIndex}_block_${blockIndex}`;
        }
      }
    }
    for (let i = 0; i < target.costumes.length; i++) {
      const costume = target.costumes[i];
      if (costume) {
        costume.semanticId = `costume_${targetIndex}_${i}_${sanitize2(costume.name)}`;
      }
    }
    for (let i = 0; i < target.sounds.length; i++) {
      const sound = target.sounds[i];
      if (sound) {
        sound.semanticId = `sound_${targetIndex}_${i}_${sanitize2(sound.name)}`;
      }
    }
    for (const comment of target.comments) {
      const blockSemanticId = comment.blockSemanticId;
      if (blockSemanticId !== null && blockSemanticId !== void 0) {
        const match = blockSemanticId.match(/script_(\d+)_(\d+)_block_(\d+)/);
        if (match) {
          const tIdx = match[1];
          const sIdx = match[2];
          const bIdx = match[3];
          if (parseInt(tIdx, 10) === targetIndex) {
            comment.blockSemanticId = `script_${targetIndex}_${sIdx}_block_${bIdx}`;
          }
        }
      }
    }
    targetIndex++;
  }
  for (let i = 0; i < cloned.monitors.length; i++) {
    const monitor = cloned.monitors[i];
    if (monitor) {
      monitor.semanticId = `monitor_${i}`;
    }
  }
  return cloned;
}
function sanitize2(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}
function computeBlockContentHash3(block) {
  const hash = createHash3("sha256");
  hash.update(block.opcode);
  for (const [key, input] of Object.entries(block.inputs).sort()) {
    hash.update(key);
    hash.update(String(input[0]));
    if (typeof input[1] !== "object" || input[1] === null || Array.isArray(input[1])) {
      hash.update(JSON.stringify(input[1]));
    }
  }
  for (const [key, field] of Object.entries(block.fields).sort()) {
    hash.update(key);
    hash.update(field[0]);
    hash.update(field[1]);
  }
  hash.update(String(block.shadow));
  return hash.digest("hex").slice(0, 16);
}

// src/render/diff-html.ts
import { JSDOM } from "jsdom";
var dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  pretendToBeVisual: true,
  resources: "usable"
});
var win = dom.window;
global.window = win;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, writable: true, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
Object.defineProperty(global, "CanvasRenderingContext2D", { value: dom.window.CanvasRenderingContext2D, writable: true, configurable: true });
Object.defineProperty(global, "Image", { value: dom.window.Image, writable: true, configurable: true });
var renderBlocks;
var scratchblocksModule = await import("scratchblocks");
var scratchblocks = scratchblocksModule.default || scratchblocksModule;
renderBlocks = scratchblocks.render || scratchblocks;
function generateDiffHTML(diff, options = {}) {
  const { title = "SB3 Diff Report", baseLabel = "Base", newLabel = "Modified" } = options;
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
  
  <main>`;
  if (diff.targets.length > 0) {
    html += `<section class="targets">
      <h2>Targets (${diff.targets.length})</h2>`;
    for (const target of diff.targets) {
      html += renderTargetDiff(target);
    }
    html += `</section>`;
  }
  if (diff.monitors.length > 0) {
    html += `<section class="monitors">
      <h2>Monitors (${diff.monitors.length})</h2>
      <table>
        <thead><tr><th>Semantic ID</th><th>Type</th><th>Changes</th></tr></thead>
        <tbody>`;
    for (const monitor of diff.monitors) {
      html += `<tr class="${monitor.type}">
        <td>${escapeHtml(monitor.semanticId)}</td>
        <td>${monitor.type}</td>
        <td>${monitor.changes?.map((c) => `${c.field}: ${JSON.stringify(c.oldValue)} \u2192 ${JSON.stringify(c.newValue)}`).join(", ") || "\u2014"}</td>
      </tr>`;
    }
    html += `</tbody></table></section>`;
  }
  if (diff.extensions.length > 0) {
    html += `<section class="extensions">
      <h2>Extensions (${diff.extensions.length})</h2>
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Version</th></tr></thead>
        <tbody>`;
    for (const ext of diff.extensions) {
      html += `<tr class="${ext.type}">
        <td>${escapeHtml(ext.name)}</td>
        <td>${ext.type}</td>
        <td>${ext.oldVersion ? `${ext.oldVersion} \u2192 ${ext.newVersion}` : ext.newVersion || "\u2014"}</td>
      </tr>`;
    }
    html += `</tbody></table></section>`;
  }
  html += `</main>
  <script>${getScript()}</script>
</body>
</html>`;
  return html;
}
function renderTargetDiff(target) {
  let html = `<details class="target" open>
    <summary class="${target.scripts.some((s) => s.blocks.some((b) => b.type !== "unchanged")) ? "modified" : "unchanged"}">
      <span class="target-name">${escapeHtml(target.name)}</span>
      <span class="target-id">${escapeHtml(target.semanticId)}</span>
    </summary>
    <div class="target-content">`;
  if (target.properties.length > 0) {
    html += `<section class="properties">
      <h3>Properties</h3>
      <table>
        <thead><tr><th>Property</th><th>Old</th><th>New</th></tr></thead>
        <tbody>`;
    for (const prop of target.properties) {
      html += `<tr>
        <td>${escapeHtml(prop.property)}</td>
        <td><pre>${escapeHtml(JSON.stringify(prop.oldValue, null, 2))}</pre></td>
        <td><pre>${escapeHtml(JSON.stringify(prop.newValue, null, 2))}</pre></td>
      </tr>`;
    }
    html += `</tbody></table></section>`;
  }
  if (target.scripts.length > 0) {
    html += `<section class="scripts">
      <h3>Scripts (${target.scripts.length})</h3>`;
    for (const script of target.scripts) {
      const hasChanges = script.blocks.some((b) => b.type !== "unchanged");
      html += `<details class="script ${hasChanges ? "modified" : "unchanged"}" ${hasChanges ? "open" : ""}>
        <summary>Script: ${escapeHtml(script.semanticId)}</summary>
        <div class="script-blocks">`;
      for (const block of script.blocks) {
        html += renderBlockDiff(block);
      }
      html += `</div></details>`;
    }
    html += `</section>`;
  }
  if (target.comments.length > 0) {
    html += `<section class="comments">
      <h3>Comments (${target.comments.length})</h3>`;
    for (const comment of target.comments) {
      html += renderCommentDiff(comment);
    }
    html += `</section>`;
  }
  if (target.costumes.length > 0) {
    html += `<section class="costumes">
      <h3>Costumes (${target.costumes.length})</h3>
      <table>
        <thead><tr><th>Semantic ID</th><th>Name</th><th>Type</th><th>MD5</th></tr></thead>
        <tbody>`;
    for (const costume of target.costumes) {
      html += `<tr class="${costume.type}">
        <td>${escapeHtml(costume.semanticId)}</td>
        <td>${escapeHtml(costume.name)}</td>
        <td>${costume.type}</td>
        <td>${costume.oldMd5 ? `${costume.oldMd5} \u2192 ${costume.newMd5}` : costume.newMd5 || "\u2014"}</td>
      </tr>`;
    }
    html += `</tbody></table></section>`;
  }
  if (target.sounds.length > 0) {
    html += `<section class="sounds">
      <h3>Sounds (${target.sounds.length})</h3>
      <table>
        <thead><tr><th>Semantic ID</th><th>Name</th><th>Type</th><th>MD5</th></tr></thead>
        <tbody>`;
    for (const sound of target.sounds) {
      html += `<tr class="${sound.type}">
        <td>${escapeHtml(sound.semanticId)}</td>
        <td>${escapeHtml(sound.name)}</td>
        <td>${sound.type}</td>
        <td>${sound.oldMd5 ? `${sound.oldMd5} \u2192 ${sound.newMd5}` : sound.newMd5 || "\u2014"}</td>
      </tr>`;
    }
    html += `</tbody></table></section>`;
  }
  html += `</div></details>`;
  return html;
}
function renderBlockDiff(block) {
  const typeClass = block.type;
  let html = `<div class="block ${typeClass}" data-semantic-id="${escapeHtml(block.semanticId)}">`;
  if (block.type === "unchanged") {
    html += `<span class="block-type">\u2022</span> ${escapeHtml(block.baseBlock?.opcode || "")} <span class="semantic-id">${escapeHtml(block.semanticId)}</span>`;
  } else if (block.type === "added") {
    html += `<span class="block-type">+</span> ${escapeHtml(block.newBlock?.opcode || "")} <span class="semantic-id">${escapeHtml(block.semanticId)}</span>`;
    if (block.newBlock) {
      html += renderScratchblocks(block.newBlock);
    }
  } else if (block.type === "removed") {
    html += `<span class="block-type">\u2212</span> ${escapeHtml(block.baseBlock?.opcode || "")} <span class="semantic-id">${escapeHtml(block.semanticId)}</span>`;
    if (block.baseBlock) {
      html += renderScratchblocks(block.baseBlock);
    }
  } else if (block.type === "modified") {
    html += `<span class="block-type">\u2260</span> ${escapeHtml(block.baseBlock?.opcode || "")} \u2192 ${escapeHtml(block.newBlock?.opcode || "")} <span class="semantic-id">${escapeHtml(block.semanticId)}</span>`;
    if (block.changes && block.changes.length > 0) {
      html += `<div class="block-changes">`;
      for (const change of block.changes) {
        html += `<div class="change"><span class="field">${escapeHtml(change.field)}</span>: <span class="old">${escapeHtml(JSON.stringify(change.oldValue))}</span> \u2192 <span class="new">${escapeHtml(JSON.stringify(change.newValue))}</span></div>`;
      }
      html += `</div>`;
    }
    if (block.baseBlock) {
      html += `<div class="block-versions"><h5>Base</h5>${renderScratchblocks(block.baseBlock)}`;
    }
    if (block.newBlock) {
      html += `<h5>Modified</h5>${renderScratchblocks(block.newBlock)}</div>`;
    }
  }
  html += `</div>`;
  return html;
}
function renderCommentDiff(comment) {
  let html = `<div class="comment ${comment.type}">`;
  if (comment.type === "unchanged") {
    html += `<span class="comment-type">\u2022</span> ${escapeHtml(comment.id)}`;
  } else if (comment.type === "added") {
    html += `<span class="comment-type">+</span> ${escapeHtml(comment.newComment?.text || "")}`;
  } else if (comment.type === "removed") {
    html += `<span class="comment-type">\u2212</span> ${escapeHtml(comment.oldComment?.text || "")}`;
  } else if (comment.type === "modified") {
    html += `<span class="comment-type">\u2260</span> ${escapeHtml(comment.oldComment?.text || "")} \u2192 ${escapeHtml(comment.newComment?.text || "")}`;
  }
  html += `</div>`;
  return html;
}
function renderScratchblocks(block) {
  try {
    const sbCode = blockToScratchblocks(block);
    const svg = renderBlocks(sbCode, { style: "scratch3" });
    return `<div class="scratchblocks-svg">${svg}</div>`;
  } catch {
    return `<div class="scratchblocks-error">Failed to render block</div>`;
  }
}
function blockToScratchblocks(block) {
  const opcode = block.opcode;
  const inputs = block.inputs;
  const fields = block.fields;
  let result = opcode;
  for (const [key, value] of Object.entries(fields)) {
    result += ` ${key}: ${value[1]}`;
  }
  for (const [key, value] of Object.entries(inputs)) {
    const val = value[1];
    if (typeof val === "string" || typeof val === "number") {
      result += ` ${key}: ${val}`;
    }
  }
  return result;
}
function escapeHtml(text) {
  return text.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, '"').replace(/'/g, "&#039;");
}
function getStyles() {
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
    details > summary::before { content: '\u25B6 '; font-size: 0.7em; transition: transform 0.2s; display: inline-block; }
    details[open] > summary::before { transform: rotate(90deg); }
  `;
}
function getScript() {
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
  `;
}

// src/validate/schema.ts
import { z } from "zod";
var SB3FieldSchema = z.tuple([z.string(), z.string()]);
var SB3InputValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.unknown()),
  z.record(z.unknown()),
  z.null()
]);
var SB3InputSchema = z.tuple([z.number(), SB3InputValueSchema]);
var SB3BlockSchema = z.lazy(() => z.object({
  opcode: z.string(),
  next: z.union([z.string(), z.null()]),
  parent: z.union([z.string(), z.null()]),
  inputs: z.record(SB3InputSchema),
  fields: z.record(SB3FieldSchema),
  shadow: z.boolean(),
  topLevel: z.boolean(),
  x: z.number().optional(),
  y: z.number().optional()
}));
var SB3TargetSchema = z.object({
  name: z.string(),
  variables: z.record(z.tuple([z.string(), z.string()])),
  lists: z.record(z.tuple([z.string(), z.array(z.string())])),
  broadcasts: z.record(z.string()),
  blocks: z.record(SB3BlockSchema),
  comments: z.record(z.object({
    blockId: z.union([z.string(), z.null()]),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    minimized: z.boolean(),
    text: z.string()
  })),
  costumes: z.array(z.object({
    name: z.string(),
    bitmapResolution: z.number(),
    dataFormat: z.string(),
    assetId: z.string(),
    md5ext: z.string(),
    rotationCenterX: z.number(),
    rotationCenterY: z.number()
  })),
  sounds: z.array(z.object({
    name: z.string(),
    dataFormat: z.string(),
    assetId: z.string(),
    md5ext: z.string(),
    rate: z.number(),
    sampleCount: z.number()
  })),
  currentCostume: z.number(),
  volume: z.number(),
  layerOrder: z.number(),
  tempo: z.number(),
  videoTransparency: z.number(),
  videoState: z.string(),
  textToSpeechLanguage: z.union([z.string(), z.null()]),
  x: z.number(),
  y: z.number(),
  size: z.number(),
  direction: z.number(),
  draggable: z.boolean(),
  rotationStyle: z.string(),
  visible: z.boolean()
});
var SB3ProjectSchema = z.object({
  targets: z.array(SB3TargetSchema),
  monitors: z.array(z.object({
    id: z.string(),
    mode: z.string(),
    opcode: z.string(),
    params: z.record(z.unknown()),
    spriteName: z.union([z.string(), z.null()]),
    value: z.union([z.string(), z.number()]),
    width: z.number(),
    height: z.number(),
    x: z.number(),
    y: z.number(),
    visible: z.boolean(),
    sliderMin: z.number(),
    sliderMax: z.number(),
    isDiscrete: z.boolean()
  })),
  extensions: z.array(z.object({
    name: z.string(),
    version: z.string()
  })),
  meta: z.object({
    semver: z.string(),
    vm: z.string(),
    agent: z.string()
  })
});
function assertSB3Project(data) {
}
function assertSB3Block(data) {
}
function validateSB3Project(data) {
  const result = SB3ProjectSchema.safeParse(data);
  if (result.success) {
    assertSB3Project(result.data);
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
function validateSB3Block(data) {
  const result = SB3BlockSchema.safeParse(data);
  if (result.success) {
    assertSB3Block(result.data);
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

// src/validate/integrity.ts
function checkIntegrity(project) {
  const issues = [];
  const semanticIds = /* @__PURE__ */ new Map();
  collectSemanticIds(project, semanticIds);
  for (const [id, paths] of semanticIds) {
    if (paths.length > 1) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_SEMANTIC_ID",
        message: `Duplicate semantic ID: ${id}`,
        path: paths.join(", "),
        details: { id, paths }
      });
    }
  }
  for (const target of project.targets) {
    for (const script of target.scripts) {
      checkScriptIntegrity(script, target.semanticId, issues);
    }
    for (const comment of target.comments) {
      if (comment.blockSemanticId) {
        const block = findBlockBySemanticId(project, comment.blockSemanticId);
        if (!block) {
          issues.push({
            severity: "warning",
            code: "ORPHAN_COMMENT",
            message: `Comment references non-existent block: ${comment.blockSemanticId}`,
            path: `${target.semanticId}.comments.${comment.id}`,
            details: { commentId: comment.id, blockSemanticId: comment.blockSemanticId }
          });
        }
      }
    }
    for (const script of target.scripts) {
      if (script.blocks.length === 0) {
        issues.push({
          severity: "warning",
          code: "EMPTY_SCRIPT",
          message: `Empty script: ${script.semanticId}`,
          path: `${target.semanticId}.scripts.${script.semanticId}`
        });
      }
    }
  }
  if (project.targets.length === 0) {
    issues.push({
      severity: "error",
      code: "NO_TARGETS",
      message: "Project has no targets",
      path: "targets"
    });
  }
  const hasStage = project.targets.some((t) => t.name === "Stage" || t.semanticId.startsWith("target_0"));
  if (!hasStage) {
    issues.push({
      severity: "warning",
      code: "NO_STAGE",
      message: "Project may be missing Stage target",
      path: "targets"
    });
  }
  return issues;
}
function collectSemanticIds(project, map) {
  for (const target of project.targets) {
    addToMap(map, target.semanticId, `targets.${target.semanticId}`);
    for (const script of target.scripts) {
      addToMap(map, script.semanticId, `${target.semanticId}.scripts.${script.semanticId}`);
      for (const block of script.blocks) {
        addToMap(map, block.semanticId, `${target.semanticId}.scripts.${script.semanticId}.blocks.${block.semanticId}`);
      }
    }
    for (const costume of target.costumes) {
      addToMap(map, costume.semanticId, `${target.semanticId}.costumes.${costume.semanticId}`);
    }
    for (const sound of target.sounds) {
      addToMap(map, sound.semanticId, `${target.semanticId}.sounds.${sound.semanticId}`);
    }
  }
  for (const monitor of project.monitors) {
    addToMap(map, monitor.semanticId, `monitors.${monitor.semanticId}`);
  }
}
function addToMap(map, id, path) {
  const existing = map.get(id) || [];
  existing.push(path);
  map.set(id, existing);
}
function checkScriptIntegrity(script, targetPath, issues) {
  const blockIds = new Set(script.blocks.map((b) => b.semanticId));
  for (const block of script.blocks) {
    if (block.next) {
      const nextBlock = script.blocks.find((b) => b.semanticId === block.next || b.id === block.next);
      if (!nextBlock) {
        issues.push({
          severity: "warning",
          code: "BROKEN_NEXT_REF",
          message: `Block references non-existent next block: ${block.next}`,
          path: `${targetPath}.scripts.${script.semanticId}.blocks.${block.semanticId}`,
          details: { blockSemanticId: block.semanticId, nextRef: block.next }
        });
      }
    }
    if (block.parent) {
      const parentBlock = script.blocks.find((b) => b.semanticId === block.parent || b.id === block.parent);
      if (!parentBlock) {
        issues.push({
          severity: "warning",
          code: "BROKEN_PARENT_REF",
          message: `Block references non-existent parent block: ${block.parent}`,
          path: `${targetPath}.scripts.${script.semanticId}.blocks.${block.semanticId}`,
          details: { blockSemanticId: block.semanticId, parentRef: block.parent }
        });
      }
    }
    for (const [inputName, input] of Object.entries(block.inputs)) {
      const value = input[1];
      if (typeof value === "object" && value !== null && !Array.isArray(value) && "semanticId" in value) {
        const refId = value.semanticId;
        if (!blockIds.has(refId)) {
          issues.push({
            severity: "warning",
            code: "BROKEN_INPUT_REF",
            message: `Block input references non-existent block: ${refId}`,
            path: `${targetPath}.scripts.${script.semanticId}.blocks.${block.semanticId}.inputs.${inputName}`,
            details: { blockSemanticId: block.semanticId, inputName, refId }
          });
        }
      }
    }
  }
  const reachable = /* @__PURE__ */ new Set();
  const topLevelBlocks = script.blocks.filter((b) => b.topLevel);
  for (const block of topLevelBlocks) {
    collectReachable(block, script.blocks, reachable);
  }
  for (const block of script.blocks) {
    if (!reachable.has(block.semanticId) && !block.shadow) {
      issues.push({
        severity: "info",
        code: "ORPHAN_BLOCK",
        message: `Block not reachable from top-level: ${block.semanticId}`,
        path: `${targetPath}.scripts.${script.semanticId}.blocks.${block.semanticId}`,
        details: { blockSemanticId: block.semanticId }
      });
    }
  }
}
function collectReachable(block, allBlocks, reachable) {
  if (reachable.has(block.semanticId)) return;
  reachable.add(block.semanticId);
  if (block.next) {
    const next = allBlocks.find((b) => b.semanticId === block.next || b.id === block.next);
    if (next) collectReachable(next, allBlocks, reachable);
  }
  for (const input of Object.values(block.inputs)) {
    const value = input[1];
    if (typeof value === "object" && value !== null && !Array.isArray(value) && "semanticId" in value) {
      const refId = value.semanticId;
      const refBlock = allBlocks.find((b) => b.semanticId === refId);
      if (refBlock) collectReachable(refBlock, allBlocks, reachable);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && "semanticId" in item) {
          const refId = item.semanticId;
          const refBlock = allBlocks.find((b) => b.semanticId === refId);
          if (refBlock) collectReachable(refBlock, allBlocks, reachable);
        }
      }
    }
  }
}
function findBlockBySemanticId(project, semanticId) {
  for (const target of project.targets) {
    for (const script of target.scripts) {
      const block = script.blocks.find((b) => b.semanticId === semanticId);
      if (block) return block;
    }
  }
  return null;
}
function printIntegrityReport(issues) {
  if (issues.length === 0) {
    console.log("\u2713 No integrity issues found");
    return;
  }
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");
  console.log(`
Integrity Report: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} infos
`);
  for (const issue of issues) {
    const prefix = issue.severity === "error" ? "\u2717" : issue.severity === "warning" ? "\u26A0" : "\u2139";
    console.log(`${prefix} [${issue.code}] ${issue.message}`);
    console.log(`   Path: ${issue.path}`);
    if (issue.details) {
      console.log(`   Details: ${JSON.stringify(issue.details, null, 2)}`);
    }
    console.log();
  }
}
export {
  assignSemanticIds2 as assignSemanticIds,
  checkIntegrity,
  collapseFromFiles,
  collectAssetsFromFiles,
  computeBlockContentHash2 as computeBlockContentHash,
  diffProjects,
  expandToFiles,
  exportSB3,
  extractAssets,
  extractAssetsToFiles,
  generateDiffHTML,
  importSB3,
  normalize,
  printIntegrityReport,
  threeWayMerge,
  topologicalSortBlocks,
  validateSB3Block,
  validateSB3Project
};
//# sourceMappingURL=index.js.map