// Type definitions for SB3 and intermediate format

export interface SB3Block {
  opcode: string
  next: string | null
  parent: string | null
  inputs: Record<string, SB3Input>
  fields: Record<string, SB3Field>
  shadow: boolean
  topLevel: boolean
  x?: number
  y?: number
}

export type SB3Input = [number, SB3InputValue] | [number, string]
export type SB3InputValue = string | number | boolean | SB3Block[] | SB3Block | null
export type SB3Field = [string, string]

export interface SB3Target {
  name: string
  variables: Record<string, [string, string]>
  lists: Record<string, [string, string[]]>
  broadcasts: Record<string, string>
  blocks: Record<string, SB3Block>
  comments: Record<string, SB3Comment>
  costumes: SB3Costume[]
  sounds: SB3Sound[]
  currentCostume: number
  volume: number
  layerOrder: number
  tempo: number
  videoTransparency: number
  videoState: string
  textToSpeechLanguage: string | null
  x: number
  y: number
  size: number
  direction: number
  draggable: boolean
  rotationStyle: string
  visible: boolean
}

export interface SB3Comment {
  blockId: string | null
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
  text: string
}

export interface SB3Costume {
  name: string
  bitmapResolution: number
  dataFormat: string
  assetId: string
  md5ext: string
  rotationCenterX: number
  rotationCenterY: number
}

export interface SB3Sound {
  name: string
  dataFormat: string
  assetId: string
  md5ext: string
  rate: number
  sampleCount: number
}

export interface SB3Monitor {
  id: string
  mode: string
  opcode: string
  params: Record<string, unknown>
  spriteName: string | null
  value: string | number
  width: number
  height: number
  x: number
  y: number
  visible: boolean
  sliderMin: number
  sliderMax: number
  isDiscrete: boolean
}

export interface SB3Extension {
  name: string
  version: string
}

export interface SB3Meta {
  semver: string
  vm: string
  agent: string
}

export interface SB3Project {
  targets: SB3Target[]
  monitors: SB3Monitor[]
  extensions: SB3Extension[]
  meta: SB3Meta
}

// Intermediate format types
export interface IntermediateBlock {
  id: string
  semanticId: string
  opcode: string
  next: string | null
  parent: string | null
  inputs: Record<string, IntermediateInput>
  fields: Record<string, [string, string]>
  shadow: boolean
  topLevel: boolean
  x?: number
  y?: number
  contentHash: string
}

export type IntermediateInput = [number, IntermediateInputValue]
export type IntermediateInputValue = string | number | boolean | string[] | IntermediateBlock | null

export interface IntermediateScript {
  blocks: IntermediateBlock[]
  semanticId: string
}

export interface IntermediateTarget {
  name: string
  semanticId: string
  variables: Record<string, [string, string]>
  lists: Record<string, [string, string[]]>
  broadcasts: Record<string, string>
  scripts: IntermediateScript[]
  comments: IntermediateComment[]
  costumes: IntermediateCostume[]
  sounds: IntermediateSound[]
  currentCostume: number
  volume: number
  layerOrder: number
  tempo: number
  videoTransparency: number
  videoState: string
  textToSpeechLanguage: string | null
  x: number
  y: number
  size: number
  direction: number
  draggable: boolean
  rotationStyle: string
  visible: boolean
}

export interface IntermediateComment {
  id: string
  blockSemanticId: string | null
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
  text: string
}

export interface IntermediateCostume {
  name: string
  semanticId: string
  bitmapResolution: number
  dataFormat: string
  assetId: string
  md5ext: string
  rotationCenterX: number
  rotationCenterY: number
}

export interface IntermediateSound {
  name: string
  semanticId: string
  dataFormat: string
  assetId: string
  md5ext: string
  rate: number
  sampleCount: number
}

export interface IntermediateProject {
  targets: IntermediateTarget[]
  monitors: IntermediateMonitor[]
  extensions: IntermediateExtension[]
  meta: IntermediateMeta
}

export interface IntermediateMonitor {
  id: string
  semanticId: string
  mode: string
  opcode: string
  params: Record<string, unknown>
  spriteName: string | null
  value: string | number
  width: number
  height: number
  x: number
  y: number
  visible: boolean
  sliderMin: number
  sliderMax: number
  isDiscrete: boolean
}

export interface IntermediateExtension {
  name: string
  version: string
}

export interface IntermediateMeta {
  semver: string
  vm: string
  agent: string
}

// Expanded format (file-system friendly)
export interface ExpandedProject {
  project: IntermediateProject
  assets: {
    costumes: Map<string, Buffer>
    sounds: Map<string, Buffer>
  }
}
