# Room designer

A 2.5D sprite-based interior designer: a generated isometric room background
with furniture sprites layered on top and manipulated in 2D. No 3D engine, no
novel-view synthesis, no navigable camera.

This repo contains the **interaction layer** and the **sprite generation
pipeline**, driven manually. No image API is wired up and nothing here costs a
generation call: you copy a prompt, run it wherever your subscription already
works, and drop the resulting sheet back in.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 26 unit tests over the pure geometry/history logic
npm run typecheck
```

## What works

- Drag furniture on a calibrated floor plane, with metre-grid snapping
- Eight-way rotation (`Q`/`E`), served by five sprites plus mirroring
- Depth sorting by ground contact, so tall objects layer correctly
- Physically correct sizing and depth scaling from real-world dimensions
- Procedural contact shadows driven by the style's light direction
- Four-handle floor calibration
- Undo/redo (`Ctrl`/`Cmd`+`Z`, `+Shift` to redo)
- `[` / `]` nudge an object's manual depth-sort tiebreak
- Sprite sheet prompt generation, chroma keying, slicing, and per-cell
  diagnostics — see below

## Decisions worth knowing before extending this

**Positions are stored in floor metres, not screen pixels.** `PlacedObject`
holds `fx`/`fz` on the floor plane and screen position is always derived through
the room's homography. Snapping, depth sorting, depth scaling and physically
correct sizing all fall out of this, and a regenerated background at a different
resolution doesn't invalidate an existing layout.

**There is no `flipped` flag.** Orientation is `facing: 0..7`. Under a fixed
isometric camera a horizontal mirror maps facing `t` to `-t`, so a symmetric
piece needs only five generated sprites (facings 0-4) and the renderer derives
5/6/7 by mirroring 3/2/1. Restricting to the four diagonal facings needs just
two. Mirroring is an implementation detail of rotation, not a user-facing
control — see `src/lib/facing.ts`.

Asymmetric pieces (an L-sectional with the chaise on one end) carry
`symmetric: false` and never mirror; they need all eight facings generated,
because a mirror produces the wrong-handed product.

**Sprites carry flat ambient lighting; shadows carry direction.** Because half
the facings are served by mirrored sprites, any directional key light baked into
a sprite would land on the wrong side when mirrored. The procedural shadow
ellipse supplies all the directionality instead. This constrains the generation
prompt as much as it constrains the renderer.

**Style is a first-class entity, not a property of a room.** Sprites are cached
per `(asset, style)` in `FurnitureAsset.spritesByStyle`. Binding them to a room
instead would mean regenerating the whole library for every new room and never
accumulating anything reusable.

**Depth sorting keys off the ground-contact point**, per-facing, not the
bounding-box centre. A bookshelf's box overlaps a sofa standing in front of it;
sorting by centre gets that backwards. `zOffset` exists for the residual cases.

**The floor plane is calibrated by hand.** An image model won't report the
projection it invented for a generated room, and inferring one is guesswork.
Four dragged corners give an exact homography in a couple of seconds.

## Generating sprites (manual loop)

In the **Generate sprites** panel: pick an asset and a coverage level, copy the
prompt, run it in whatever image tool you already pay for, then drop the
returned sheet back into the file input. It slices, keys, and applies straight
onto the canvas.

Coverage levels exist because mirroring does half the work:

| Setting | Sprites generated | Facings covered |
| --- | --- | --- |
| diagonal | 2 | 4 |
| canonical | 5 | 8 |
| all | 8 | 8 (asymmetric pieces only) |

**All facings come back in one image, not one call each.** Consistency is then
enforced within a single generation rather than hoped for across several, it
costs one image instead of N, and a 2K sheet sliced 2x2 still leaves ~1024px per
sprite — well past what a 2.5D canvas needs.

**Sprites are generated onto flat chroma green and keyed out afterwards.** Image
models don't emit alpha, so alpha extraction has to happen after the style
match. Keying is done on green dominance (`g - max(r, b)`) rather than distance
to a fixed RGB value, which survives the uneven backdrop shading models tend to
produce, with a soft alpha ramp so edges don't turn jagged and a despill pass so
they don't keep a green halo once composited.

**Anchors are computed geometrically, not guessed from pixels.** We know the
asset's real dimensions and the camera the sheet was generated against, so the
ground-contact point comes from projecting the object's box at that facing and
seeing where its footprint centre lands relative to the projected silhouette.
That's exact where bottom-centre-of-silhouette is approximate, and the metric
scale (`renderedPxPerMeter`) falls out of the same comparison.

### The diagnostics are the point

That same comparison measures whether the model actually held the camera
contract, which is the riskiest assumption in the whole design. Each cell
reports its measured size and an **aspect error** — how far its proportions
depart from what the projection predicts. Cells past tolerance are flagged
amber, and `scaleSpread` reports whether the sheet is internally consistent or
whether sprites will jump size as they rotate.

So the spike is a measurement rather than an eyeball test: run a few product
photos through, read the numbers, and find out whether multi-angle sheets hold
identity and camera before building anything else on top of them.

## Layout

```
src/types/scene.ts           data model
src/lib/facing.ts            facing -> (sprite, mirrored) resolution
src/lib/homography.ts        floor plane: DLT solve, projection, px-per-metre, snapping
src/lib/isoCamera.ts         axonometric projection shared by renderer and slicer
src/lib/layout.ts            per-object screen placement + depth sort
src/lib/shadow.ts            procedural contact shadows
src/lib/sceneStore.ts        immutable scene + undo/redo
src/lib/dummyAssets.ts       placeholder sprite/room generation (delete once real)
src/lib/generation/
  prompt.ts                  sheet + room prompt templates, camera contract
  chroma.ts                  keying, despill, silhouette measurement (pure)
  sheet.ts                   slicing, geometric anchors, camera diagnostics
  raster.ts                  browser encode/decode
  provider.ts                provider interface + manual implementation
src/components/              Konva canvas, calibrator, toolbar, generate panel
```

## Placeholder assets

`src/lib/dummyAssets.ts` renders shaded isometric boxes through the same camera
contract the style carries, with correct per-facing ground anchors and a known
metric scale. They are deliberately real geometry rather than flat rectangles so
that anchors, depth sorting and facing are genuinely exercised. The whole file
goes away once sprites come from the generation pipeline.

## Not built yet

1. **Room ingestion.** `buildRoomPrompt` exists and de-furnishes as well as
   restyles, but there's no upload flow — rooms are still the placeholder. The
   de-furnishing matters: anything left in the background is baked in and
   permanently un-draggable, which contradicts the whole premise.
2. **Scene persistence.** State is in memory and dies with a refresh.
3. **Chat-to-edit.** Natural language → tool calls mutating
   `fx`/`fz`/`facing`/`scale`. Spatial edits must never trigger regeneration;
   only appearance changes do.
4. **An API-backed provider.** `GenerationProvider` is the seam; the manual
   implementation is the only one so far. Adding an API one is a config change
   rather than a rewrite.

Still worth doing on the sprite side: semi-transparent materials (glass tops,
sheer shades) are where chroma keying degrades, and there's no handling for a
model that ignores the grid badly enough that objects cross cell boundaries.
