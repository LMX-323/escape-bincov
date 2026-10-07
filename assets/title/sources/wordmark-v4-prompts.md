# 字标 v4：内置 ImageGen 提示词与实际选择

2026-10-07。参考为 docs/title-parallax/depth-v2/concept-approved.png。保留原场景，只调整菜单字标。

## 第一版：提取轮廓与磨损

Use case: background-extraction.
Input is the approved pixel-game menu concept. Extract ONLY the exact two-line Chinese wordmark at its upper left into a standalone transparent PNG.
Text must read precisely: first row "逃离", second row "滨科夫". Preserve this reference's letterforms, relative row sizes, left alignment, spacing, thick blocky military-industrial silhouette, squared stepped edges and restrained chipped-ink wear. The second row is wider and heavier; the first row is roughly half its width. The complete ink block should have approximately 2:1 width-to-height ratio, as in the reference.
Crop the output around the lettering with a modest transparent margin. Remove the English subtitle, menu, divider, top caption and ALL background scenery. Interior counters, chipped gaps and space between letters must be true transparency. No drop shadow, glow, outlines, highlights, bevel, gold metal, embossed faces, 3D thickness or smooth gradients.
One flat aged-ivory ink color approximately #e4dab8. Pixel art with coherent hard stepped edges. Keep the letters readable at about 300–430 display pixels wide; avoid tiny scattered speckle/noise that becomes large holes when reduced. This is faithful extraction of the reference logo, not a new decorative font or replacement scene. Output only the two-row Chinese lettering, actual alpha transparency.

## 第二版：尝试去除浮雕和柔边

Use case: precise-object-edit.
Edit ONLY rendering style of this transparent two-line Chinese wordmark. Keep exact text "逃离" above "滨科夫", letter outlines, positions, row proportions and original crop.
Eliminate ALL bevel, gradients, shiny gold, outline fringe and soft/translucent shadows. The result must be a FLAT ONE-INK pixel stencil: each solid ink pixel is the same matte aged ivory #e4dab8, and every background/counter/cutout pixel is fully transparent. No outlines, no grey strokes, no 3D edge, no off-white halo. Use sharp rectangular pixel clusters. Sparse large deliberate chipped notches are okay; remove tiny noisy speckles. Counters must remain clearly open so all five Chinese characters are immediately readable at a 288-pixel-wide game title. True alpha transparency. Flat printed ink, not painted metal or embossed material.

## 选择及运行准备

第一版原图仍有浅浮雕和边缘过渡，不能直接作为运行纹理。第二版在实际 288/432 像素宽显示时过于整齐，工业磨损不足。最终选择第一版的轮廓与适量磨损，保存为 wordmark-industrial-v4.png；使用既有字标准备流程进行最近邻采样、单色旧白（228,218,184）和二值透明转换。运行版 title-wordmark-industrial-v4.png 为 144×72；1×、2×、3×显示。代码准备去掉了原图的浮雕颜色和柔边，不把原始生成结果直接声明为合格。

已在 1920×1080、1280×720 和 390×844 的真实场景预览中比较两版，再接入并检查正式打包图。旧字标源图和运行图保留。
