import { useRef, useState } from 'react';
import type { Room, Style } from '../types/scene';
import { buildRoomPrompt } from '../lib/generation/prompt';
import { readImageAsDataUrl } from '../lib/generation/raster';
import { stepFor, toDisplay, toMeters, unitLabel, type Unit } from '../lib/units';
import { PromptBlock } from './PromptBlock';

interface Props {
  room: Room;
  style: Style;
  unit: Unit;
  calibrating: boolean;
  onBackground: (background: {
    url: string;
    size: { width: number; height: number };
  }) => void;
  onDimensions: (widthMeters: number, depthMeters: number) => void;
  onCalibrate: (on: boolean) => void;
}

/**
 * The room background: one image for the whole scene, uploaded once.
 *
 * Separate from furniture on purpose. A room is a single rendering with no
 * rotations — the camera is fixed and the walls never turn — whereas a piece of
 * furniture is a set of views of a movable object. They are different kinds of
 * asset and share nothing but the style.
 */
export function RoomPanel({
  room,
  style,
  unit,
  calibrating,
  onBackground,
  onDimensions,
  onCalibrate,
}: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { widthMeters, depthMeters } = room.floor;
  const prompt = buildRoomPrompt({ style, widthMeters, depthMeters, unit });

  const upload = async (file: File) => {
    setStatus('Reading…');
    try {
      const image = await readImageAsDataUrl(file);
      onBackground({
        url: image.url,
        size: { width: image.width, height: image.height },
      });
      onCalibrate(true);
      setStatus(`Loaded ${image.width}×${image.height}. Mark the floor corners.`);
    } catch (error) {
      setStatus(`Failed: ${(error as Error).message}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section>
      <h2>Room background</h2>
      <p className="muted">
        One stylised rendering of the empty room. No rotations — the camera is
        fixed.
      </p>

      <PromptBlock prompt={prompt} rows={12} />

      <label className="stacked">
        Room image
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>

      {status && <p className="muted">{status}</p>}

      <h3>Floor plane</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={calibrating}
          onChange={(e) => onCalibrate(e.target.checked)}
        />
        Show calibration handles
      </label>

      {/*
        These two numbers are the scene's metric anchor: together with the
        dragged quad they set pixels-per-metre, which drives object sizing,
        depth scaling, snap spacing and shadow size. They belong next to the
        handles because the right value is something you judge while looking at
        the room, not something you know before uploading it.
      */}
      <div className="fields">
        <label className="stacked">
          Width ({unitLabel(unit)})
          <input
            type="number"
            min={0.5}
            step={stepFor(unit)}
            value={Number(toDisplay(widthMeters, unit).toFixed(2))}
            onChange={(e) =>
              onDimensions(
                Math.max(0.5, toMeters(Number(e.target.value) || 0, unit)),
                depthMeters,
              )
            }
          />
        </label>
        <label className="stacked">
          Depth ({unitLabel(unit)})
          <input
            type="number"
            min={0.5}
            step={stepFor(unit)}
            value={Number(toDisplay(depthMeters, unit).toFixed(2))}
            onChange={(e) =>
              onDimensions(
                widthMeters,
                Math.max(0.5, toMeters(Number(e.target.value) || 0, unit)),
              )
            }
          />
        </label>
      </div>

      <p className="muted small">
        Drag the four handles onto the real floor corners, then set how far
        across that quad actually is. Everything else scales from it.
      </p>
    </section>
  );
}
