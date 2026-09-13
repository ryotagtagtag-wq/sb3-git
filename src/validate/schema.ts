// Schema validation using Zod
import { z } from 'zod'
import type { SB3Project, SB3Target, SB3Block, SB3Input, SB3Field } from '../codec/types.js'

// Zod schemas for validation - permissive to handle all SB3 formats
const SB3FieldSchema = z.tuple([z.string(), z.string()])

// Input value - permissive to handle all SB3 formats
const SB3InputValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.unknown()),
  z.record(z.unknown()),
  z.null()
])

const SB3InputSchema = z.tuple([z.number(), SB3InputValueSchema])

// Forward declaration for recursive block type
const SB3BlockSchema = z.lazy(() => z.object({
  opcode: z.string(),
  next: z.union([z.string(), z.null()]),
  parent: z.union([z.string(), z.null()]),
  inputs: z.record(SB3InputSchema),
  fields: z.record(SB3FieldSchema),
  shadow: z.boolean(),
  topLevel: z.boolean(),
  x: z.number().optional(),
  y: z.number().optional()
}))

const SB3TargetSchema = z.object({
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
})

const SB3ProjectSchema = z.object({
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
})

// Type assertions to bridge Zod's inferred types with our strict TypeScript types
function assertSB3Project(data: unknown): asserts data is SB3Project {}
function assertSB3Block(data: unknown): asserts data is SB3Block {}

export function validateSB3Project(data: unknown): { success: true; data: SB3Project } | { success: false; errors: z.ZodError } {
  const result = SB3ProjectSchema.safeParse(data)
  if (result.success) {
    assertSB3Project(result.data)
    return { success: true, data: result.data }
  }
  return { success: false, errors: result.error }
}

export function validateSB3Block(data: unknown): { success: true; data: SB3Block } | { success: false; errors: z.ZodError } {
  const result = SB3BlockSchema.safeParse(data)
  if (result.success) {
    assertSB3Block(result.data)
    return { success: true, data: result.data }
  }
  return { success: false, errors: result.error }
}
