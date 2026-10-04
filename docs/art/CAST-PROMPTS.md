# GuildQuest cast art prompt record

Generated 2026-10-03 with the built-in `image_gen` tool. The existing
`public/art/guild-dawn.webp` was loaded first and used as the shared style
reference for every design sheet. It supplies the soft ink linework, painted
Japanese fantasy game-anime finish, realistic proportions, and blue-green /
amber palette. It was not used to copy the other people in the scene.

Each character has two image-generation stages:

1. `reference.png`: one-character model sheet on white: front, side, back,
   neutral/thoughtful/smiling face close-ups, and color swatches.
2. `poses.png`: the generated model sheet for that character was supplied as
   the sole identity reference. The output is a 1536x1024 transparent atlas
   with exactly three 512px columns: neutral, thoughtful, happy. The three
   columns were split mechanically with Sharp; no figure was redrawn.

The atlas prompt shared by all characters was:

> Use case: illustration-story. Asset type: transparent character pose atlas.
> Genuinely transparent alpha background; no floor, cast shadow, or scenery.
> Soft ink linework with rich painterly fills matching the supplied character
> reference, Japanese fantasy game anime, realistic proportions, no chibi.
> 1536x1024 horizontal canvas divided into exactly three equal 512px columns;
> one figure centered in each, head to feet fully inside, generous transparent
> padding, no dividers. Exactly three figures; preserve exact face, hair,
> outfit, and accessories; only expression, arms/hands, and subtle posture
> vary. No labels, logos, watermark, other characters, background, shadows,
> cropped limbs, overlap, extra limbs, or costume changes.

For the second pass on ALDO, LINA, and BRUNO, the prompt additionally required
an invisible 28px safe margin inside every column, with no hand, bow, shield,
cloak, scarf, or accessory touching a boundary. This replaced the first atlas
versions after visual review found boundary fragments.

## Fixed character briefs

| ID | Identity and locked design details |
| --- | --- |
| `aldo` | 19-year-old young man; tousled brown hair, amber eyes; olive hooded cloak, natural cream tunic, brown leather gear; short bow and quiver. |
| `mina` | 17-year-old girl; brown hair in one long braid; sage-green modest dress, natural cream cape, herb pouch and herbs. |
| `lina` | 16-year-old girl; copper bob; rust scarf, navy tunic, coin pouch; practical modest clothing. |
| `bruno` | 34-year-old large man; short black hair and chin beard; worn steel breastplate, wine-red cloak, leather gear, large round shield. |
| `mirei` | 24-year-old woman; dark navy low ponytail, round glasses; cream blouse, blue-green vest, long skirt; guild ledger and pen, no weapon. |
| `yuto` | Adult slim male guild clerk in year five; short slightly tousled black hair, gray-blue eyes, no glasses; cream shirt, navy vest, brown leather shoulder bag, ledger and feather pen, no weapon. |
| `garo` | V2: older plump innkeeper, round face, balding crown, sparse gray-brown side hair, thick mustache ONLY, no chin beard; rust-red apron, cream rolled sleeves, brown trousers, ladle and plate. See v2 prompts below; the original v1 brief is superseded. |

For each sheet, the fixed design sentence above was prefixed with:

> Exactly one character only. Create a clean professional model sheet with
> front, side, and back full-body views, three face close-ups (neutral,
> thoughtful/concerned, gentle smile), and compact color swatches on a pure
> white studio background. Preserve identical face, hair, clothing, and props
> in every view. Readable English character name only if a label is rendered;
> no extra text, logo, watermark, other people, creature traits, exaggerated
> anatomy, duplicate limbs, or cropped feet.

## Output lineage

| Character | Model sheet | Pose atlas source | Runtime files |
| --- | --- | --- | --- |
| Aldo | `artifacts/source-art/characters/aldo-reference.png` | `artifacts/source-art/characters/aldo-poses.png` | `public/art/characters/aldo/reference.webp`, `neutral.webp`, `thoughtful.webp`, `happy.webp` |
| Mina | `artifacts/source-art/characters/mina-reference.png` | `artifacts/source-art/characters/mina-poses.png` | `public/art/characters/mina/reference.webp`, `neutral.webp`, `thoughtful.webp`, `happy.webp` |
| Lina | `artifacts/source-art/characters/lina-reference.png` | `artifacts/source-art/characters/lina-poses.png` | `public/art/characters/lina/reference.webp`, `neutral.webp`, `thoughtful.webp`, `happy.webp` |
| Bruno | `artifacts/source-art/characters/bruno-reference.png` | `artifacts/source-art/characters/bruno-poses.png` | `public/art/characters/bruno/reference.webp`, `neutral.webp`, `thoughtful.webp`, `happy.webp` |
| Mirei | `artifacts/source-art/characters/mirei-reference.png` | `artifacts/source-art/characters/mirei-poses.png` | `public/art/characters/mirei/reference.webp`, `neutral.webp`, `thoughtful.webp`, `happy.webp` |
| Yuto | `artifacts/source-art/characters/yuto-reference.png` | `artifacts/source-art/characters/yuto-poses.png` | `public/art/characters/yuto/reference.webp`, `neutral.webp`, `thoughtful.webp`, `happy.webp` |
| Garo | `artifacts/source-art/characters/garo-reference.png` | `artifacts/source-art/characters/garo-poses.png` | `public/art/characters/garo/reference.webp`, `neutral.webp`, `thoughtful.webp`, `happy.webp` |

## Mechanical checks

- All seven model sheets are 1536x1024 RGB PNG sources and 1536x1024 WebP
  references.
- All seven atlas sources are 1536x1024 RGBA PNGs.
- All 21 pose WebPs are exactly 512x1024 RGBA, non-empty, with transparent
  alpha at every outer edge after the initial alpha cleanup; GARO v2 preserves generated alpha, with at most 1/255 at the outer edge.

- The three output columns are exact 512px extracts from each atlas. The
  source PNG atlases remain available for future re-splitting.
- Visual checks were performed on every model sheet, every atlas, and a
  temporary contact sheet composited over alternating dark and light
  backgrounds. Review sheets are saved beside the source art at
  `artifacts/source-art/characters/review-reference.jpg` and
  `artifacts/source-art/characters/review-poses.jpg`. The earlier temporary
  contact sheet is also outside the repository at
  `C:\Users\takas\AppData\Local\Temp\guildquest-characters-contact.png`.
- The generated PNGs contain straight-alpha RGB values from the source
  renderer even where alpha is zero; those RGB values are invisible in normal
  compositing. For the original six remaining characters, alpha cleanup removed values below 24; GARO v2 preserves source alpha. ALDO's
  three final poses have no non-zero alpha pixels on any outer edge, and the
  dark/light review sheet shows no visible brown matte halo.

## GARO v2 — distinct from BRUNO (2026-10-03)

User approved a redesign after the two men looked too similar. BRUNO remains the square-faced, athletic 34-year-old warrior with dark short hair and a chin beard. GARO is now an older, plump innkeeper with a round face, receding/bald crown, gray-brown side hair, a thick mustache and a clean-shaven chin. The existing runtime paths were replaced together. Previous GARO source PNGs and runtime WebPs are archived in `artifacts/source-art/characters/garo-v1/` and are not current identity references.

Built-in image_gen was used. The old GARO sheet was used only for outfit/style continuity; the new v2 sheet was the sole identity reference for the new pose atlas. An initial atlas was rejected because the happy pose crossed a column boundary. The final atlas is mechanically split into 512x1024 WebPs, preserving generated alpha (outer alpha at most 1/255, visually clear, no subject clipping). No alpha cleanup was applied to v2.

### Accepted reference-sheet prompt

Use case: illustration-story. Asset: replacement canonical GARO character design sheet for a Japanese fantasy story game. Reference image is the OLD GARO design: preserve its painterly anime rendering, cream rolled-sleeve shirt, rust-red work apron, dark brown trousers, simple leather shoes, ladle and serving plate, but deliberately REDESIGN the person to distinguish him from the athletic square-jawed bearded warrior Bruno. NEW GARO: older tavern keeper, looks late 50s, shorter stocky and comfortably plump, round belly, rounded shoulders, broad round face, soft full cheeks, prominent rounded nose, smile lines and crow's feet. Balding crown with a high receding hairline, sparse short gray-brown hair ONLY at sides/back; generous visible scalp. Thick warm gray-brown WALRUS MUSTACHE ONLY, clean shaven cheeks and chin, NO chin beard, NO full beard, NO muscular warrior physique. Grounded kind practical innkeeper, not a caricature, not chibi. Clearly a different man in face, age and silhouette. Layout 1536x1024 white background: full-body FRONT, SIDE and BACK in left two-thirds, three face closeups (neutral, thoughtful, warm laugh) at right plus small color swatches. Exact same new identity in every view. Label only 'GARO'. All views fully framed including feet, no clipping, no weapons, no armor, no other characters. Match the existing refined warm earthtone painted anime linework.

### Accepted pose-atlas prompt

Use case: illustration-story. Create a transparent GAME CHARACTER POSE ATLAS of exactly this NEW GARO from the supplied canonical reference. Same older plump innkeeper with round soft face, rounded nose, receding bald crown, sparse gray-brown side/back hair, thick WALRUS MUSTACHE ONLY, clean-shaven chin and cheeks, rounded belly. Same cream rolled-sleeve shirt, rust-red apron, brown trousers, leather shoes, ladle and plate. EXACT identity and wardrobe from reference. Painterly Japanese fantasy anime finish identical to reference. Canvas 1536x1024, THREE equal invisible 512-pixel columns. One full-body character centered in EACH column, SAME body scale and baseline. LEFT: neutral welcoming attentive expression, holding ladle down and plate. CENTER: thoughtful/concerned, one hand touching his mustache/chin, plate supported in other hand. RIGHT: warm laughing smile eyes softly closed, open welcoming hand, ladle in other hand. Keep his visibly balding head and large mustache in ALL three. All heads and feet fully included. Strict 40-pixel transparent padding INSIDE EVERY column, all props and hands stay within their own column; nothing touches left/right/top/bottom or crosses boundaries. Genuinely transparent alpha background, no floor, no shadows, no scenery, no lettering, no labels, no panels or dividers, no floating accessories. Exactly three complete characters, no extra figures or body parts. Do not restore the old bearded athletic design. CRITICAL sprite extraction constraint: Make every figure noticeably SMALLER within the canvas: character height approximately 800px on the 1024px canvas with 100px clear space above head and below feet; total body/props width at most 350px per 512px column. Figure centers x=256, 768,1280. Absolutely CLEAR TRANSPARENT vertical corridors x=0-65,447-577,959-1089,1471-1535. In RIGHT happy pose keep BOTH elbows close to torso, one palm held forward at waist with no arm extended sideways, the ladle held vertically close against the apron inside the body silhouette. All three poses compact, no wide gesture, no utensil outside the silhouette. No shadow, no floor. This is a production sprite sheet to be sliced at x512 and x1024 so no visible part can cross those boundaries.

