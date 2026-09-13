import { z } from 'zod';

interface SB3Block {
    opcode: string;
    next: string | null;
    parent: string | null;
    inputs: Record<string, SB3Input>;
    fields: Record<string, SB3Field>;
    shadow: boolean;
    topLevel: boolean;
    x?: number;
    y?: number;
}
type SB3Input = [number, SB3InputValue] | [number, string];
type SB3InputValue = string | number | boolean | SB3Block[] | SB3Block | null;
type SB3Field = [string, string];
interface SB3Target {
    name: string;
    variables: Record<string, [string, string]>;
    lists: Record<string, [string, string[]]>;
    broadcasts: Record<string, string>;
    blocks: Record<string, SB3Block>;
    comments: Record<string, SB3Comment>;
    costumes: SB3Costume[];
    sounds: SB3Sound[];
    currentCostume: number;
    volume: number;
    layerOrder: number;
    tempo: number;
    videoTransparency: number;
    videoState: string;
    textToSpeechLanguage: string | null;
    x: number;
    y: number;
    size: number;
    direction: number;
    draggable: boolean;
    rotationStyle: string;
    visible: boolean;
}
interface SB3Comment {
    blockId: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    minimized: boolean;
    text: string;
}
interface SB3Costume {
    name: string;
    bitmapResolution: number;
    dataFormat: string;
    assetId: string;
    md5ext: string;
    rotationCenterX: number;
    rotationCenterY: number;
}
interface SB3Sound {
    name: string;
    dataFormat: string;
    assetId: string;
    md5ext: string;
    rate: number;
    sampleCount: number;
}
interface SB3Monitor {
    id: string;
    mode: string;
    opcode: string;
    params: Record<string, unknown>;
    spriteName: string | null;
    value: string | number;
    width: number;
    height: number;
    x: number;
    y: number;
    visible: boolean;
    sliderMin: number;
    sliderMax: number;
    isDiscrete: boolean;
}
interface SB3Extension {
    name: string;
    version: string;
}
interface SB3Meta {
    semver: string;
    vm: string;
    agent: string;
}
interface SB3Project {
    targets: SB3Target[];
    monitors: SB3Monitor[];
    extensions: SB3Extension[];
    meta: SB3Meta;
}
interface IntermediateBlock {
    id: string;
    semanticId: string;
    opcode: string;
    next: string | null;
    parent: string | null;
    inputs: Record<string, IntermediateInput>;
    fields: Record<string, [string, string]>;
    shadow: boolean;
    topLevel: boolean;
    x?: number;
    y?: number;
    contentHash: string;
}
type IntermediateInput = [number, IntermediateInputValue];
type IntermediateInputValue = string | number | boolean | string[] | IntermediateBlock | null;
interface IntermediateScript {
    blocks: IntermediateBlock[];
    semanticId: string;
}
interface IntermediateTarget {
    name: string;
    semanticId: string;
    variables: Record<string, [string, string]>;
    lists: Record<string, [string, string[]]>;
    broadcasts: Record<string, string>;
    scripts: IntermediateScript[];
    comments: IntermediateComment[];
    costumes: IntermediateCostume[];
    sounds: IntermediateSound[];
    currentCostume: number;
    volume: number;
    layerOrder: number;
    tempo: number;
    videoTransparency: number;
    videoState: string;
    textToSpeechLanguage: string | null;
    x: number;
    y: number;
    size: number;
    direction: number;
    draggable: boolean;
    rotationStyle: string;
    visible: boolean;
}
interface IntermediateComment {
    id: string;
    blockSemanticId: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    minimized: boolean;
    text: string;
}
interface IntermediateCostume {
    name: string;
    semanticId: string;
    bitmapResolution: number;
    dataFormat: string;
    assetId: string;
    md5ext: string;
    rotationCenterX: number;
    rotationCenterY: number;
}
interface IntermediateSound {
    name: string;
    semanticId: string;
    dataFormat: string;
    assetId: string;
    md5ext: string;
    rate: number;
    sampleCount: number;
}
interface IntermediateProject {
    targets: IntermediateTarget[];
    monitors: IntermediateMonitor[];
    extensions: IntermediateExtension[];
    meta: IntermediateMeta;
}
interface IntermediateMonitor {
    id: string;
    semanticId: string;
    mode: string;
    opcode: string;
    params: Record<string, unknown>;
    spriteName: string | null;
    value: string | number;
    width: number;
    height: number;
    x: number;
    y: number;
    visible: boolean;
    sliderMin: number;
    sliderMax: number;
    isDiscrete: boolean;
}
interface IntermediateExtension {
    name: string;
    version: string;
}
interface IntermediateMeta {
    semver: string;
    vm: string;
    agent: string;
}

declare function importSB3(buffer: Buffer): Promise<SB3Project>;
declare function exportSB3(project: SB3Project, assets: Map<string, Buffer>): Promise<Buffer>;
declare function extractAssets(buffer: Buffer): Promise<Map<string, Buffer>>;

declare function normalize(project: SB3Project): IntermediateProject;

declare function expandToFiles(project: IntermediateProject, outputDir: string): Promise<void>;
declare function collapseFromFiles(inputDir: string): Promise<IntermediateProject>;
declare function extractAssetsToFiles(assets: Map<string, Buffer>, outputDir: string): Promise<void>;
declare function collectAssetsFromFiles(inputDir: string): Promise<Map<string, Buffer>>;

declare function assignSemanticIds(project: IntermediateProject): IntermediateProject;
declare function topologicalSortBlocks(blocks: IntermediateBlock[]): IntermediateBlock[];
declare function computeBlockContentHash(block: IntermediateBlock): string;

interface BlockDiff {
    semanticId: string;
    type: 'unchanged' | 'added' | 'removed' | 'modified';
    baseBlock?: IntermediateBlock;
    newBlock?: IntermediateBlock;
    changes?: FieldChange[];
}
interface FieldChange {
    field: string;
    oldValue: unknown;
    newValue: unknown;
}
interface ScriptDiff {
    semanticId: string;
    blocks: BlockDiff[];
}
interface TargetDiff {
    semanticId: string;
    name: string;
    scripts: ScriptDiff[];
    comments: CommentDiff[];
    costumes: AssetDiff[];
    sounds: AssetDiff[];
    properties: PropertyDiff[];
}
interface CommentDiff {
    id: string;
    type: 'unchanged' | 'added' | 'removed' | 'modified';
    oldComment?: {
        text: string;
        x: number;
        y: number;
    };
    newComment?: {
        text: string;
        x: number;
        y: number;
    };
}
interface AssetDiff {
    semanticId: string;
    name: string;
    type: 'unchanged' | 'added' | 'removed' | 'modified';
    oldMd5?: string;
    newMd5?: string;
}
interface PropertyDiff {
    property: string;
    oldValue: unknown;
    newValue: unknown;
}
interface ProjectDiff {
    targets: TargetDiff[];
    monitors: MonitorDiff[];
    extensions: ExtensionDiff[];
}
interface MonitorDiff {
    semanticId: string;
    type: 'unchanged' | 'added' | 'removed' | 'modified';
    changes?: FieldChange[];
}
interface ExtensionDiff {
    name: string;
    type: 'unchanged' | 'added' | 'removed' | 'modified';
    oldVersion?: string;
    newVersion?: string;
}
declare function diffProjects(base: IntermediateProject, modified: IntermediateProject): ProjectDiff;

interface MergeResult {
    project: IntermediateProject;
    conflicts: MergeConflict[];
}
interface MergeConflict {
    type: 'block' | 'comment' | 'costume' | 'sound' | 'property' | 'target' | 'script';
    path: string;
    base?: unknown;
    ours?: unknown;
    theirs?: unknown;
    message: string;
    autoResolved: boolean;
    resolution?: 'ours' | 'theirs' | 'base' | 'merged';
}
declare function threeWayMerge(base: IntermediateProject, ours: IntermediateProject, theirs: IntermediateProject, options?: {
    autoResolve?: boolean;
}): MergeResult;

declare function generateDiffHTML(diff: ProjectDiff, options?: {
    title?: string;
    baseLabel?: string;
    newLabel?: string;
}): string;

declare function validateSB3Project(data: unknown): {
    success: true;
    data: SB3Project;
} | {
    success: false;
    errors: z.ZodError;
};
declare function validateSB3Block(data: unknown): {
    success: true;
    data: SB3Block;
} | {
    success: false;
    errors: z.ZodError;
};

interface IntegrityIssue {
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    path: string;
    details?: unknown;
}
declare function checkIntegrity(project: IntermediateProject): IntegrityIssue[];
declare function printIntegrityReport(issues: IntegrityIssue[]): void;

export { type AssetDiff, type BlockDiff, type CommentDiff, type ExtensionDiff, type FieldChange, type IntegrityIssue, type MergeConflict, type MergeResult, type MonitorDiff, type ProjectDiff, type PropertyDiff, type ScriptDiff, type TargetDiff, assignSemanticIds, checkIntegrity, collapseFromFiles, collectAssetsFromFiles, computeBlockContentHash, diffProjects, expandToFiles, exportSB3, extractAssets, extractAssetsToFiles, generateDiffHTML, importSB3, normalize, printIntegrityReport, threeWayMerge, topologicalSortBlocks, validateSB3Block, validateSB3Project };
