import type { FurnitureAsset, PlacedObject, Scene, Style } from '../types/scene';
import { ALL_FACINGS, CANONICAL_FACINGS } from '../lib/facing';
import { makeDummyRoom, makeDummySpriteSet, type DummyBoxSpec } from '../lib/dummyAssets';
import type { IsoCamera } from '../lib/isoCamera';

export const DUMMY_STYLE: Style = {
  id: 'style-warm-iso',
  name: 'Warm isometric',
  promptFragment:
    'stylised isometric interior illustration, soft matte materials, flat ambient lighting, no cast shadows',
  camera: { elevationDeg: 34, azimuthDeg: 45 },
  lightDirection: { azimuthDeg: 135, elevationDeg: 42 },
};

const CAMERA: IsoCamera = {
  elevationDeg: DUMMY_STYLE.camera.elevationDeg,
  azimuthDeg: DUMMY_STYLE.camera.azimuthDeg,
  pxPerMeter: 110,
};

interface DummyAssetSpec extends DummyBoxSpec {
  id: string;
  name: string;
  category: string;
  symmetric: boolean;
}

const CATALOG: DummyAssetSpec[] = [
  {
    id: 'asset-sofa',
    name: 'Three-seat sofa',
    category: 'sofa',
    widthMeters: 2.1,
    depthMeters: 0.92,
    heightMeters: 0.78,
    color: '#6f7fa8',
    symmetric: true,
  },
  {
    id: 'asset-coffee-table',
    name: 'Coffee table',
    category: 'table',
    widthMeters: 1.1,
    depthMeters: 0.6,
    heightMeters: 0.42,
    color: '#a8845f',
    symmetric: true,
  },
  {
    id: 'asset-floor-lamp',
    name: 'Floor lamp',
    category: 'lamp',
    widthMeters: 0.38,
    depthMeters: 0.38,
    heightMeters: 1.68,
    color: '#c9a94e',
    symmetric: true,
  },
  {
    id: 'asset-bookshelf',
    name: 'Bookshelf',
    category: 'storage',
    widthMeters: 0.9,
    depthMeters: 0.34,
    heightMeters: 1.92,
    color: '#7d6a58',
    symmetric: true,
  },
  {
    // Deliberately asymmetric: mirroring this would swap which end the chaise
    // sits on, so it needs all eight facings generated rather than five.
    id: 'asset-sectional',
    name: 'L-sectional (left chaise)',
    category: 'sofa',
    widthMeters: 2.4,
    depthMeters: 1.6,
    heightMeters: 0.74,
    color: '#5f8f7d',
    symmetric: false,
    handedMarker: true,
  },
];

export function buildDummyScene(): Scene {
  const room = makeDummyRoom(CAMERA, 6, 5, 2.6);

  const assets: Record<string, FurnitureAsset> = {};
  for (const spec of CATALOG) {
    assets[spec.id] = {
      id: spec.id,
      name: spec.name,
      category: spec.category,
      widthMeters: spec.widthMeters,
      depthMeters: spec.depthMeters,
      heightMeters: spec.heightMeters,
      spritesByStyle: {
        [DUMMY_STYLE.id]: makeDummySpriteSet(
          spec,
          CAMERA,
          spec.symmetric ? CANONICAL_FACINGS : ALL_FACINGS,
          spec.symmetric,
        ),
      },
    };
  }

  const objects: PlacedObject[] = [
    place('obj-sofa', 'asset-sofa', 1.9, 1.1, 4),
    place('obj-table', 'asset-coffee-table', 2.0, 2.5, 0),
    // The two tall pieces are the depth-sorting edge cases worth watching:
    // their bounding boxes overlap furniture that is genuinely in front of them.
    place('obj-lamp', 'asset-floor-lamp', 0.6, 1.5, 2),
    place('obj-shelf', 'asset-bookshelf', 4.6, 0.6, 4),
    place('obj-sectional', 'asset-sectional', 4.0, 3.4, 1),
  ];

  return {
    room: {
      id: 'room-dummy',
      styleId: DUMMY_STYLE.id,
      backgroundImageUrl: room.url,
      backgroundSize: room.size,
      floor: room.floor,
    },
    style: DUMMY_STYLE,
    assets,
    objects,
  };
}

function place(
  id: string,
  assetId: string,
  fx: number,
  fz: number,
  facing: number,
): PlacedObject {
  return {
    id,
    roomId: 'room-dummy',
    assetId,
    fx,
    fz,
    facing: facing as PlacedObject['facing'],
    scaleMultiplier: 1,
    zOffset: 0,
    status: 'ready',
  };
}

export { CATALOG as DUMMY_CATALOG };
