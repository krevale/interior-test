# Room designer

A 2.5D sprite-based interior designer: a generated isometric room background
with furniture sprites layered on top and manipulated in 2D. No 3D engine, no
novel-view synthesis, no navigable camera.

This repo currently contains **step 1 only**: the interaction layer, built
end-to-end against procedurally generated placeholder assets. No image
generation API is wired up, and nothing here costs a generation call.

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

## Layout

```
src/types/scene.ts      data model
src/lib/facing.ts       facing -> (sprite, mirrored) resolution
src/lib/homography.ts   floor plane: DLT solve, projection, px-per-metre, snapping
src/lib/layout.ts       per-object screen placement + depth sort
src/lib/shadow.ts       procedural contact shadows
src/lib/sceneStore.ts   immutable scene + undo/redo
src/lib/dummyAssets.ts  placeholder sprite/room generation (delete once real)
src/components/         Konva canvas, calibrator, toolbar
```

## Placeholder assets

`src/lib/dummyAssets.ts` renders shaded isometric boxes through the same camera
contract the style carries, with correct per-facing ground anchors and a known
metric scale. They are deliberately real geometry rather than flat rectangles so
that anchors, depth sorting and facing are genuinely exercised. The whole file
goes away once sprites come from the generation pipeline.

## Not built yet

Everything downstream of the interaction layer:

1. Room background generation — restyle **and de-furnish** the uploaded photo.
   The source room's own furniture would otherwise be baked into the background
   and permanently un-draggable, which conflicts with the entire premise.
2. Furniture sprite pipeline: cutout → style match → **matte again**. Image
   models return opaque images, so alpha extraction has to run after the style
   match, not just before it. Edge quality there decides whether composites look
   pasted-on.
3. Scene persistence.
4. Chat-to-edit: natural language → tool calls mutating `x`/`z`/`facing`/`scale`.
   Spatial edits must never trigger regeneration; only appearance changes do.

Generation should sit behind a provider interface with two implementations — one
manual (export a request bundle to a folder, drop the result back in) and one
API-backed — so the app stays developable and testable with no credentials.

### The risk to validate first

Style matching conflates two jobs, and only one of them is easy. Restyling is
straightforward; **viewpoint normalization** — turning a straight-on product
photo into a 3/4 isometric view — is novel-view synthesis sitting in the middle
of the critical path. Pin the camera in the prompt as an explicit contract and
test it against ~20 awkward product photos before building anything on top of it.

Generating all angles as a single contact sheet, then slicing, is likely the
move: consistency is enforced within one image rather than hoped for across
several calls, it costs one generation instead of N, and a 2K sheet sliced 2x2
still yields ~1024px per sprite.
