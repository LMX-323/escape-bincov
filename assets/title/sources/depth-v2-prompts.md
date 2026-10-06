# 2026-10-07 空间与光照返修

全部使用内置 ImageGen，唯一画面权威为 concept-v2-pixel.png。本轮尚未获得用户审美认可。

## chair

Use case: precise-object-edit.
Asset type: transparent-background pixel-art foreground chair for an existing 2.5D game menu.
Input image 1 is the approved complete concept, the sole authority for camera perspective, geometry and lighting. Input image 2 is the rejected current small standalone chair; do NOT copy its camera or fully visible toy-like proportions.
Extract/reconstruct ONLY the near-camera green metal chair from the lower-left/lower-middle foreground of image 1. Match that exact back-view perspective: broad trapezoid green padded back faces camera, top rail slopes down to the right; seat comes toward bottom right and is cut off by the lower screen. Camera is standing behind chair, viewing into room, not viewing a product from above. The chair is a LARGE foreground occluder, not a small fully visible floor prop. Show broad dark back, worn tubular metal edges, small amber rim only on the upper/right surfaces from lamp at upper right, cold dark blue shadow faces; suppress shiny excessive outlines. Bottom of seat and legs may extend beyond asset canvas.
Use reference image 1's chunky deliberate pixel clusters, subdued blue-charcoal and olive, no vector softness, no smooth gradients or photorealism, no high contrast material noise. Keep correct contact and occlusion within chair.
Output a single transparent PNG, landscape approximately 4:3, chair filling the frame from near top-left toward lower-right, no environment, no floor, no shadow backdrop, no text, no UI, no labels. True alpha transparency.

## desk

Use case: background-extraction.
Asset type: transparent pixel-art midground wooden radio desk for a 2.5D game title.
The single input is the approved complete concept and is the strict authority. Extract/reconstruct ONLY the entire wooden desk and all its tabletop objects from the bottom-right of that exact image: vintage radio, the little receiver and headphones, folded paper map, diagonally resting rifle, satchel, tin mug and small tin. Retain the exact standing eye-height camera, desk-edge slopes, object size relationships and viewing angles visible in the reference. The desk is a broad MIDGROUND plane leading diagonally from left rear to lower-right front, viewed from a modestly elevated standing position; do not turn it into a steep top-down product shot. In particular the satchel and radio remain modest in size behind the expansive map and tabletop, not giant props.
Preserve long straight coherent perspective edges; table thickness, vertical boards and under-table shadow agree. Lighting is a single hanging warm lamp above/left of the radio: localized amber pool on the map, restrained warm chips on upward edges, deep cold dark faces under the table and on the foreground right, cast/contact shadows of radio, bag, mug, rifle and curled map clearly visible. Do not outline every edge in orange or illuminate all surfaces uniformly. Keep large readable dark pixel clusters and precise small scratches from the approved image; no smooth airbrush, photorealistic shading or glossy materials.
Remove ALL environment, boat, windows, walls, hanging lamp, foreground rope and chair. True transparent alpha around desk and props. Do NOT add any new objects or labels. Keep the reference table continuation cut off by the right and bottom frame. Output one wide landscape transparent PNG approximately 1.9:1 with the tabletop and all attached props filling the frame. No text, UI, mockup or presentation background.

## harbor

Use case: lighting-weather.
Asset type: opaque distant harbour-and-water background plate for an existing layered pixel-art game menu.
Input image 1 is the approved concept: use ONLY its muted misty blue-grey atmosphere, restrained distant silhouette contrast, coherent standing eye-level perspective, water reflection rhythm, and deliberately clustered pixel style.
Input image 2 is the current harbour plate to revise. Preserve its wide 16:7 framing and the horizon exactly 40% down the frame; it must still fit the existing room openings. Change its excessive saturated blue, busy outlined clouds and overly crisp black cranes into the reference's softer-distance values using hard pixel clusters, NOT blur: grey slate overcast with large quiet masses; several ranks of receding cranes fade into haze; distant buildings sit consistently on the horizon. The far shore is visually behind the interior desk. Distant lamp glows are small and sparse, not huge bright squares.
Water: broad calm slate-blue planes with perspective-correct horizontal pixel ripple marks: tiny densely spaced near the horizon and wider more separated nearer camera. Only a FEW vertical broken amber reflection trails underneath actual shore lights; no yellow confetti everywhere. Keep most water subdued enough that a warmly lit interior desk will be the focus. No smooth gradients, no photographic reflections, no exaggerated orange.
REMOVE ALL near foreground piers, posts, ropes, boat and floor from this background plate, replacing them with continuous correctly receding water. The game has separate near-pier and boat layers. Leave the entire lower water unobstructed. No room, desk, window, UI, text, border. Output one opaque landscape pixel-art image about 2.286:1.

## boat

Use case: background-extraction.
Asset type: transparent pixel-art fishing boat, back scene asset for a 2.5D title.
The input is the approved concept image. Extract and reconstruct ONLY its moored fishing/work boat visible through the doorway, matching its exact perspective, scale relationships and lighting. The boat is a background object several metres beyond a pier, seen from shore and slightly above. Keep the TALL thin mast and rigging, small compact wheelhouse low on the hull, long low dark hull pointing toward the right, modest warm square cabin windows. Match the reference's relatively shallow hull and restrained orange trim. Do not enlarge the cabin or expose a huge front face; do not turn it into a cute toy tugboat. Keep its hull in one consistent perspective with the distant horizontal waterline. Complete any small part obscured by the reference doorway, but do not add structures.
Cold slate blue/grey muted desaturated midtones, deep cool hull shadow and just localized warm window spill on adjacent rail/deck. Background-distance edges and texture are quieter than the bright near desk. Pixel art with deliberate hard chunky clusters, no antialias, smooth gradients, glossy 3D or photorealism.
Remove sea, posts, pier, reflections, ropes leading to shore, door and ALL environment. Single isolated boat with true alpha background. Fit complete mast, rigging and hull in a portrait transparent canvas about 3:4; tight reasonable margins. No cast drop-shadow outside hull, no UI or text.
