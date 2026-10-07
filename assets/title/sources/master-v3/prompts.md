# 统一母版 v3：内置 ImageGen 提示词与选择

所有源图以 concept-v2-pixel.png 为共同构图依据。图片仍需以实际组合验收。

## 母版

Use case: precise-object-edit.
Edit target: the attached approved pixel-art game-menu concept, 1672x941 landscape. This is the sole authoritative finished painting. We need the SAME painting without UI, not a new interpretation.
Change ONLY the overlay UI areas on the left: remove the large Chinese and English logo, top-left location caption, horizontal divider lines, menu items, selection square, bottom-left motion text and saved-progress text. Reconstruct the obscured DARK timber wall/planks/crates/floor where the removed text was, using the visible adjacent painting. The left stays dark and sparse.
STRICT INVARIANTS: Preserve the entire scene camera, all object silhouettes/positions/scales, perspective slopes, palette and original pixel texture. Preserve the large cropped chair at bottom centre-left with visible sliver of seat, thick nearest rope and wooden jamb framing right, desk in the midground with smaller radio/bag/map/rifle, lamp above, boat beyond doorway and hazy distant port. Preserve the warm lamp's localized pool, cool shadow faces, thin amber edge light, grainy clustered pixel shadows, water reflection pattern, and overcast grey atmosphere.
Do not sharpen or make more detailed than original. Do NOT turn this into photographic or smoothly shaded digital painting. The reference is chunky discrete pixel art; preserve its actual jagged pixel clusters and matte limited color ramps. Do not add antialiasing, lens blur, bloom, smooth gradients or new noisy scratches. No new objects. No new framing or crop. Output 16:9 opaque PNG, no text/UI/watermark anywhere. Everything outside UI removal areas should match the source as closely as possible.

## 室内

Use case: background-extraction.
Edit target: attached full 1672x941 pixel painting, exact camera lock.
Produce the ROOM STRUCTURE LAYER for this same frame. Keep exact 16:9 canvas, every object stays at the exact input screen coordinates. No zoom, crop, reframe, perspective change or rescaling.
KEEP: left dark plank walls, all fixed crates, hanging small rope on left wall, open blue door and hardware, fixed wall/ceiling beams, central pillar and its pinned paper, window mullions/sill, interior wooden floor. Match all original colors, discrete pixel clusters and original lighting.
REMOVE: hanging lamp, all desk/cabinet and its attached objects, foreground green chair, thick nearest rope AND its adjacent near-camera rightmost timber jamb. Fill the removed furniture areas with plausible continuation of existing floor/wall/sill, keeping unified perspective and cool dark shadows. The newly exposed areas may be sparse because furniture will cover them again.
Make ONLY all outdoor areas visible through door/window openings true transparent alpha (sky, boat, sea, pier/posts, outside ground). Preserve exact irregular door and window edge positions. Interior areas are opaque even if dark. Do not leave any outdoor scenery visible. Do not leave ghost outlines of removed objects.
This is careful separation of the input painting, not a new room redesign. Keep coarse hard-edged pixel art; no new texture density, no antialias or smooth shading. Export one transparent PNG on same 16:9 FULL SCENE canvas, no UI/text/checkerboard background.

## 桌台

Use case: background-extraction.
The attached pixel-art painting is the exact source. Make a TRANSPARENT DESK LAYER on the SAME full 1672x941 / 16:9 scene canvas, keeping the desk and every prop at their exact screen positions, exact original size, exact angle. Do NOT tightly crop or center the desk. The upper-left ~60% is empty transparent.
KEEP ONLY the midground wooden desk/cabinet and EVERYTHING touching its tabletop: radio with small receiver and headphones, stacked small boxes and round tin, curled paper map, diagonal rifle/sling/notebooks, green satchel, mug, pen holder. Desk begins near normalized (0.42,0.64), radio top near (0.65,0.46). Keep silhouettes and all colors/texture IDENTICAL to input where visible, including actual contact shadows, broken amber highlights, deep charcoal cabinet faces, muted pixel clusters. Preserve the original tabletop slopes and camera. Complete only small parts hidden behind the foreground chair and right rope, so desk continues unobstructed to the right and bottom edge; avoid adding new geometry.
REMOVE all background/room/windows/sky/boat/water/lamp, the foreground chair, the nearest thick rope and near right jamb. These are transparent, not filled black. Preserve all original interior negative spaces below desk as transparent. NO floating square patches of wall behind radio or pen cup. No shadow halo around extracted silhouette.
Strictly match the original chunky matte pixel rendering: no new glossy photo texture, fine-grain noise, bevel, smoothing, blur, antialiasing, gradients. Do not repaint into a product render. No UI or text or labels. Output one true-alpha PNG exactly SAME FRAME AND PLACEMENT as input.

## 椅子

Use case: background-extraction.
Input is the approved pixel-art scene. Extract ONLY the near-camera green metal chair at bottom-left/centre, onto true transparent alpha. Output the SAME FULL 1672x941 16:9 scene canvas. Chair must stay at EXACT screen position and exact scale: back starts around x456,y663, back angles down-right toward x655,y891; partially visible seat spans x650..965 along the bottom edge. Do not center, shrink or reframe it. Preserve original visible pixels, silhouette, eye-height perspective, chunky matte olive/dark blue pixel clusters, a few thin warm edge chips. Preserve transparent gaps between tubes. Complete only tiny hidden pieces if necessary; keep lower chair/seat cut off by frame. Remove ALL background, room, floor, table, boat, lamp and UI; no backdrop or fake checkerboard. No new shading, antialiasing, photorealism or product render. Exact full-scene alignment is more important than filling the output with the object.

## 近景

Use case: background-extraction.
Extract ONLY the extreme foreground thick dark braided ropes AND their adjacent near-camera vertical timber jamb at the RIGHT edge of this exact pixel-art image. This entire right framing silhouette is one foreground layer. Same 1672x941 16:9 full scene canvas, exact coordinates and scale. Do not center or zoom. Shape is thick around x1530..1672 at the top, tapers near middle then reaches x1435..1672 toward bottom. Preserve the original chunky braid contours, muted brown edge facing the lamp and deep nearly black blue-green front faces. This is very near viewer, cropped by top/right/bottom. Keep exact original pixel clusters and original lighting, no invented smooth shading or extra detail.
Remove all scene, desk and chair behind this silhouette to true transparent alpha. No remaining slices of desk or window. Slightly complete silhouette to frame boundaries where needed. Full screen canvas mostly empty transparent on left. No text/UI/fake transparency grid, no object rescale or camera change, no added ropes.

## 吊灯首次（未选用）

Use case: background-extraction.
Extract ONLY the hanging green industrial lamp from this exact approved pixel-art scene, including suspension cable, small upper fixture, metal shade and luminous bulb. Same FULL 1672x941 /16:9 transparent scene canvas, exact screen placement/scale: centre near x1090,y125; shade spans x964..1217 and y82..177; cable reaches top frame. Do NOT enlarge, tightly crop, centre or redraw it. Preserve exactly the chunky original pixel clusters, matte green paint, localized amber underside and warm bulb, cool top of shade. No room or sky background, no rectangular remnants, no huge light cone or smooth halo, true transparent alpha elsewhere. Keep minimal natural glow immediately around bulb only, no blur filter. No text or labels. The layer must overlay the original source precisely.

## 吊灯校正（运行时仍按原构图校准尺寸）

Use case: background-extraction.
Exact-position cutout, NOT object redesign. Image 1 is the authoritative complete scene. Image 2 is a failed extraction: its lamp has been enlarged and moved DOWN. Reject those proportions.
Output a 1672x941 FULL SCENE transparent canvas matching image 1. Extract image 1's lamp at ORIGINAL size. Lamp shade leftmost x964, rightmost x1217, lower rim y178, top of shade y80; bulb centre (1090,167); thin cable at x1090 runs from top to the fixture at y38. Thus the ENTIRE lamp is within the top 205 pixels (21.8% of scene height) and 16% of frame width. The rest of canvas is empty transparent. Preserve source angular matte green shade, warm underside and hard pixel blocks. No round bloom halo below bulb. No remaining sky or beams behind lamp. No text. Do not center content within canvas; do not make lamp fill canvas; no zoom. Preserve original source painting as a precisely aligned separated layer.

## 室外底图

Use case: precise-object-edit.
Create the OUTDOOR CLEAN PLATE behind this same pixel-art scene. Remove the entire interior room, furniture, ceiling, hanging lamp, foreground chair and ropes, revealing continuous outdoor sky, far port and sea in their places. NO camera change: preserve the exact scale/positions of the cranes, horizon (around y340 of 941), ships' distant silhouettes, slate grey haze and existing water reflection fragments visible through the original windows. Continue those same planes into the newly exposed parts of the frame.
Also REMOVE the single foreground fishing boat, replacing it with matching water and distant shore. REMOVE all near pier wood posts, ropes, bollards and pier floor because they will be a separate occlusion layer. Only sky, distant port and uninterrupted sea remain.
The input's outdoor color and rendering are authoritative: light cool desaturated grey-blue overcast, crane silhouettes lose contrast with distance, a few small warm lamps, sparse broken vertical light trails. Horizon fixed 36% down, full 1672x941 16:9 canvas. Lower sea with perspective-scaled hard pixel ripples, NOT detailed photographic waves or repeated saturated blue stripes. Don't add decorative objects or new architecture. Keep the SAME original chunky pixel clusters and soft-distance values achieved by discrete palette steps, NOT blur. No smooth gradient, no photorealism, no UI/text. One opaque full-frame PNG.

## 船（运行时按母版校准尺寸）

Use case: background-extraction.
Extract ONLY the background workboat from the doorway of this pixel painting, leaving it at EXACT original screen position and scale on the SAME 1672x941 16:9 full scene canvas. Do not zoom or centre the boat.
Mast top near (720,107), wheelhouse near (665,354), hull spans about x580..870, waterline y500. Preserve the narrow high mast, low compact cabin, long low blue hull and precise original viewing angle. Preserve existing muted discrete pixel blocks, warm windows and thin amber rim, do not make a glossy or noisier object. Complete only parts hidden by door frame/pier ropes to create clean boat silhouette. No shore-mooring rope included.
Remove everything else: room, sea, reflection, foreground pier/posts/ropes, floor, desk, chair, lamp. All background is true transparent alpha. Do not retain rectangles of sky around rigging or tiny attached pier blocks. No drop shadow beyond hull, no UI/text. Output exact full-frame aligned transparent PNG, boat remains small occupying about 18% of canvas width and 43% of height.

## 码头首次（用户指出混入室内地板，未选用）

Use case: background-extraction.
Extract ONLY the NEAR OUTDOOR PIER from this exact scene on the SAME FULL 1672x941 16:9 transparent canvas, keeping all source screen coordinates. Keep the wet pier boards leading from doorway threshold around x595..883/y660 back toward the boat at x600..880/y470, including the short bollards and sagging ropes IN FRONT of the boat. Also keep the pier's vertical posts and connecting ropes visible through the RIGHT window around x1100..1560/y350..478. Complete small missing parts behind room/furniture only; no redesign. Preserve original chunky pixel marks, cold wet slate wood and localized broken reflections.
REMOVE the boat/rigging, sky, port, sea, all room/door/window frames, desk, chair, foreground right rope/jamb and hanging lamp. True transparent alpha everywhere else, including gaps between pier posts. No remaining water rectangle. The wet pier silhouette can continue down toward bottom centre hidden behind the later room layer; no new piers outside these two regions. NO crop, zoom or centering. One full scene aligned layer. Same original matte discrete pixel art, no smooth gradients, antialias, glow or new noisy details.

## 码头更正（不含室内地板，运行时校准偏移）

Use case: precise-object-edit.
Input 1 is a FAILED pier extraction to correct. Input 2 is the complete master scene, with doorway defining the indoor/outdoor boundary. Input 3 is the room layer showing the fixed threshold.
The FAILED layer incorrectly contains INSIDE ROOM FLOOR extending down to the bottom of the canvas. REMOVE that whole lower indoor floor region, the extra horizontal step across it, and every board on the camera side of the doorway threshold. Those belong exclusively to the room layer, not the outdoor pier.
Keep only: (A) the EXTERIOR wet pier behind the doorway, its bollards and sagging mooring ropes in front of the boat, roughly x550..940 and y420..665 on this 1672x941 frame; (B) the separate right-window outdoor posts/ropes around x1000..1600,y355..510.
At the lower edge of A, the exterior boards end naturally behind the door threshold, approximately line from (596,650) to (883,700). Do not draw the threshold itself. All pixels lower than y710 MUST be fully transparent. Most of canvas is transparent. No indoor wood floor anywhere. No big dark horizontal plank crossing the outdoor walkway. Interior and exterior floors must be distinct planes separated by the room's raised sill.
Preserve exact original screen scale, position and original pixel colors for retained outdoor components; SAME 1672x941 full 16:9 canvas, no zoom/crop/reframe. Remove all other scene elements and any remaining water background. True alpha, no fake checkerboard. Preserve chunky matte pixel art, no smooth shading or new textures.
