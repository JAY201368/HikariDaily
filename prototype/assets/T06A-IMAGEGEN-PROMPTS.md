# T06A exact built-in imagegen prompts

2026-10-22. Built-in `image_gen` only; `transparent_background: true` on every call. No CLI/API fallback. Every output preserved in prototype/assets as a versioned sibling; T06 originals unchanged. Generated illustrations with photographic appearance, not real historical product photographs.

## Wind refinement

Input: wind-photo-v2.png (edit target; inspected with view_image). Saved output: `wind-photo-v3.png`.
Built-in source: `/Users/jay/.codex/generated_images/01a16231-7b03-7ac3-8afa-e1ff58e76340/exec-cec6ffc7-b852-453f-9fe2-8fe5be2dd4f8.png`.

```text
Use case: precise-object-edit. Asset: transparent local web prototype wind instrument housing. Edit target: wind-photo-v2.png. Preserve its upright frontal silhouette, open five-blade impeller wind passage and hub, rectangular blank grey-green LCD at same position/proportions, and two accessible triangular keys. Refine this existing object into a deliberate retro photographic field instrument: graphite shell, restrained aged nickel protective impeller rim and narrow LCD bezel, fine grip texture, carefully designed seams, tiny vermilion key accent, localized edge/handling wear instead of all-over scratches. Soft natural upper-left light, photoreal product cutout, same frontal camera and object orientation. Integrate fictional engraved HIKARI FIELD / HF-96 and H.K. naturally. Keep LCD entirely blank. No new appendages, no blocked wind passage, no real brand, no readouts, no labels or backdrop. Preserve genuine transparent alpha background.
```

## Solar-direction housing

Input: none (new asset). Saved output: `solar-direction-v1.png`.
Built-in source: `/Users/jay/.codex/generated_images/01a16231-7b03-7ac3-8afa-e1ff58e76340/exec-3851ffb8-9c48-43b3-9879-ce9e1acfd79f.png`.

```text
Use case: product-mockup. Asset: standalone transparent photographic cutout of a fictional vintage handheld solar-direction instrument for an offline webpage. Frontal near-orthographic view, complete object isolated, portrait aspect about 4:5, subtle visible thickness. Purposeful old photographic field design: broad round warm ivory EMPTY dial occupying upper 55 percent, aged brass rim with fine knurling, graphite black compact lower body with large wide rectangular blank grey-green reading window occupying lower center. Dial must be completely empty inside its rim: web DOM will supply cardinal directions, ticks and computed sun pointer. Lower reading window also completely blank for two DOM angle readouts. Small usable side knurled adjustment wheel; small vermilion index on housing outside dial. Integrated fictional engraving HIKARI FIELD and SD-21 below screen, small H.K. at bottom. Natural soft upper-left light, restrained old nickel/brass highlights, real seams, localized grip wear and patina. Photoreal material, no strap, chain, probe, cable or background. No actual brand, no numbers, no exposure scales, no compass needle, no printed screen text. Genuine transparent alpha background.
```

## Light-meter housing, initial

Input: none (new asset). Saved output: `light-meter-v1.png`.
Built-in source: `/Users/jay/.codex/generated_images/01a16231-7b03-7ac3-8afa-e1ff58e76340/exec-4caf37c6-5791-402d-bc32-9bfb3b4e15e2.png`.

```text
Use case: product-mockup. Asset: transparent standalone vintage photographic light-meter housing for a web prototype. Photoreal complete front-facing near-orthographic cutout with subtle thickness. Compact upright handheld classic light meter, dark olive/graphite pebble-textured body, rounded shoulders, a believable milky white hemispherical incident-light receptor dome centered on top, restrained aged nickel rim, side knurled mechanical wheel with no numerical exposure scale, seams and screws. A generously sized wide rectangular BLANK grey-green window centered on front, about 60% body width and 28% body height; web DOM will display interpreted light words and solar stage here, so leave window entirely empty. Integrated small fictional engraving HIKARI FIELD / LM-21 below window, H.K. at bottom, tiny vermilion functional marker beside wheel. Same soft natural upper-left light and restrained localized grip/edge wear as an old photographic field kit. No real brand, no EV or lux marks, no exposure tables, no shutter/aperture/ISO numbers, no printed readouts, no external probe or cable, no strap/chain, no backdrop. Genuine transparent alpha.
```

## Light-meter cutout revision, selected

Input: light-meter-v1.png (edit target; inspected as generated image). Saved output: `light-meter-v2.png`.
Built-in source: `/Users/jay/.codex/generated_images/01a16231-7b03-7ac3-8afa-e1ff58e76340/exec-4bc70207-2712-4b1b-957a-d3801e7dcc74.png`.

```text
Use case: background-extraction. Edit target light-meter-v1.png. Keep the entire light-meter object, exact shape, dome, surface, blank screen, fictional lettering and lighting unchanged. Remove ALL surrounding studio backdrop, vignette, glow, haze and cast shadow outside the object's physical silhouette. Output a clean hard-isolated photographic cutout with genuinely fully transparent pixels everywhere outside the object, including corners and gaps. Do not make the object translucent. Preserve solid opaque object pixels and anti-aliased boundary. Transparent alpha background, no black or grey background.
```

Outputs inspected individually and in scene/enlarged details. All have RGBA transparent background pixels. The light revision preserves slightly translucent antialiased source rendering; no post-generation recolour or alpha manipulation was applied. DOM supplies all readouts; native CSS supplies card and solar marks. Backpack raster/masks retain T06 source bytes.
