import JSZip from '@turbowarp/jszip';
import { writeFile } from 'node:fs/promises';

const project = {
  targets: [
    {
      isStage: true,
      name: "Stage",
      variables: {},
      lists: {},
      broadcasts: {},
      blocks: {
        "block1": {
          opcode: "event_whenflagclicked",
          next: "block2",
          parent: null,
          inputs: {},
          fields: {},
          shadow: false,
          topLevel: true,
          x: 100,
          y: 100
        },
        "block2": {
          opcode: "motion_movesteps",
          next: null,
          parent: "block1",
          inputs: {
            STEPS: [4, 10]
          },
          fields: {},
          shadow: false,
          topLevel: false
        }
      },
      comments: {},
      currentCostume: 0,
      costumes: [
        {
          name: "backdrop1",
          bitmapResolution: 1,
          dataFormat: "svg",
          assetId: "cd21514d0531fdffb22204e0ec5ed84a",
          md5ext: "cd21514d0531fdffb22204e0ec5ed84a.svg",
          rotationCenterX: 240,
          rotationCenterY: 180
        }
      ],
      sounds: [],
      volume: 100,
      layerOrder: 0,
      tempo: 60,
      videoTransparency: 0.5,
      videoState: "off",
      textToSpeechLanguage: null
    },
    {
      isStage: false,
      name: "Sprite1",
      variables: {},
      lists: {},
      broadcasts: {},
      blocks: {
        "block3": {
          opcode: "event_whenflagclicked",
          next: "block4",
          parent: null,
          inputs: {},
          fields: {},
          shadow: false,
          topLevel: true,
          x: 100,
          y: 100
        },
        "block4": {
          opcode: "looks_sayforsecs",
          next: null,
          parent: "block3",
          inputs: {
            MESSAGE: [1, "Hello!"],
            SECS: [4, 2]
          },
          fields: {},
          shadow: false,
          topLevel: false
        }
      },
      comments: {},
      currentCostume: 0,
      costumes: [
        {
          name: "costume1",
          bitmapResolution: 1,
          dataFormat: "svg",
          assetId: "f7a5c9b3d4e8f1a2b3c4d5e6f7a8b9c0",
          md5ext: "f7a5c9b3d4e8f1a2b3c4d5e6f7a8b9c0.svg",
          rotationCenterX: 48,
          rotationCenterY: 50
        }
      ],
      sounds: [
        {
          name: "pop",
          dataFormat: "wav",
          assetId: "83c36d806dc92327b9e7e9c8f7a6b5c4",
          md5ext: "83c36d806dc92327b9e7e9c8f7a6b5c4.wav",
          rate: 44100,
          sampleCount: 256
        }
      ],
      volume: 100,
      layerOrder: 1,
      tempo: 60,
      videoTransparency: 0.5,
      videoState: "off",
      textToSpeechLanguage: null
    }
  ],
  monitors: [],
  extensions: [],
  meta: {
    semver: "3.0.0",
    vm: "scratch-vm",
    agent: "scratch-git"
  }
};

const zip = new JSZip();
zip.file('project.json', JSON.stringify(project));
zip.file('cd21514d0531fdffb22204e0ec5ed84a.svg', '<svg></svg>');
zip.file('f7a5c9b3d4e8f1a2b3c4d5e6f7a8b9c0.svg', '<svg></svg>');
zip.file('83c36d806dc92327b9e7e9c8f7a6b5c4.wav', Buffer.alloc(0));

const buffer = await zip.generateAsync({ type: 'nodebuffer' });
await writeFile('./tests/fixtures/sample-project.sb3', buffer);
console.log('Created sample-project.sb3');
