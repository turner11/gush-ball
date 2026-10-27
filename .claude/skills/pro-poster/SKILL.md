---
name: pro-poster
description: >-
  Turns a player or team photo into a pro, publication-ready social poster (1080x1350) with a "magical" look:
  stadium lights, glowing particles, rim light, and crisp Hebrew or English headline text and team logo on top.
  The AI image model builds the scene, then a script adds the text and logo so they stay sharp. Use this whenever
  the user wants to make a photo "ready for publication", "make it look pro", or turn a picture into an Instagram
  post, signing or "welcome" announcement, re-signing ("ממשיך!"), MVP, game-day or player-spotlight graphic. Also
  use it when they hand over a photo plus a name or slogan and team colors, even without the word "poster".
  It also makes a wide, text-free banner (2400x1000) for a post's image in the home-page featured-posts carousel
  (FeaturedPosts): use it for "banner", "cover image for the post", "image for the home page hero / carousel".
  Inputs: main image, optional extra images (logo, teammates), optional text, optional 1-2 theme colors.
argument-hint: "<photo> [extra images...] [text] [color1,color2] [banner]"
allowed-tools: Bash, PowerShell, Read, Write, Glob
---

# Pro poster

Make a photo look like the work of a club's design team: the poster a top club posts the day a player signs.
The reference bar is the art from Maccabi, the NBA team accounts and ESPN editorials.

Two engines, each doing what it is good at:

1. **`scripts/generate.py`** sends the photo(s) and your art-direction prompt to an image-edit model (Gemini or
   OpenAI). It builds the scene: background, light, particles, color grade. It never draws text.
2. **`scripts/overlay.py`** adds the headline, the name banner and the logo with real fonts. Image models garble
   Hebrew and redraw logos wrong, so these never go through the model.

Run both with `uv run`, which installs their few dependencies on its own.

There are two outputs. A **poster** (the default) is a 1080x1350 social post with text. A **banner** is a wide image
for a post on the site's home page: see [Banner mode](#banner-mode). Pick the banner when the user mentions the home
page, the carousel, the hero, a banner or a cover for a post on the site. Paths below are relative to this skill's
folder (`.claude/skills/pro-poster/`).

## Inputs

Work out the four inputs from the request. Ask only when the main photo is missing.

| Input | If missing |
|---|---|
| **Main image**: the hero, usually one player | Ask for it. |
| **Extra images**: logos, teammates, action shots | Sort each one: a **logo** (crest or badge, flat graphic) goes to `overlay.py --logo`. A **person or photo** goes to `generate.py` as an extra input. |
| **Text** | No text is fine: build the poster without it. With text, split it into a short **headline** ("ממשיך!", "WELCOME", "MVP") and a **sub** line, usually the player's name. With one phrase only, use it as the headline. |
| **Theme colors** (1-2) | Read them off the jersey or the logo yourself and turn them into hex. Use a name such as "yellow and blue" as the club's real shades, not pure #FFFF00. |

Without `GEMINI_API_KEY` or `OPENAI_API_KEY` set, stop and point the user to `references/api-keys.md`. Each
generation costs a few cents, so don't loop endlessly.

## Workflow

### 1. Study the photo

`Read` the main image and note:

- who the subject is and how they are framed (full body, waist up, head)
- the pose and its direction
- the jersey colors, number and text
- the face, which must survive unchanged
- anything that would fight a poster: a messy background, cut-off limbs, low resolution

### 2. Pick a style

Open `references/styles.md` and pick the style that fits the moment and the material:

- one action photo + "signing / re-signed / MVP" → **Arena magic**
- 2+ people → **Editorial collage**
- a calm portrait + "welcome" → **Framed card**

When unsure, Arena magic is the crowd-pleaser.

### 3. Write the prompt

Fill in the style's template from `references/styles.md` and save it to a `prompt.txt` in a work folder: the
scratchpad if you have one, otherwise next to the photo.

`generate.py` puts fixed guardrails ahead of your prompt on every call. They keep each face and jersey true, allow a
retoucher-level cleanup of a weak camera (denoise, sharpen, exposure, relighting), and ban all text in the image. So
don't repeat those rules: spend the prompt on the scene. A good prompt does two things:

- **Reserves a text zone.** "Keep the lower 30% calmer and darker" (or the top, whichever side the face isn't on), so
  the headline has room.
- **Names the colors** as both hex and words ("glowing gold #F2B705 and royal blue #1D4E9E"), and names where each
  color appears: the rim light, the particles, the haze.

### 4. Generate

```bash
uv run scripts/generate.py --prompt-file <work>/prompt.txt --out <work>/bg.png <main-photo> [extra-photos...]
```

Then `Read` `bg.png` and check it with a critic's eye before going on:

- [ ] Is the face clearly the same person? Compare it with the original side by side.
- [ ] Is the photo visibly cleaner than the original (sharper, less noise, better exposure) but not plastic or
  airbrushed?
- [ ] Are the hands, fingers, ball and limbs anatomically right? Are there no extra or fused fingers?
- [ ] Is the jersey number and text the same as the original?
- [ ] Is there no stray text or pseudo-lettering in the scene?
- [ ] Is the text zone actually calm enough?
- [ ] Is it "magical": layered light, depth, particles, a color grade? Or is it a flat cut-and-paste?

If something fails, fix the prompt for that specific failure (say what to change, don't just repeat louder) and
regenerate. Stop after **3 attempts**: show the best one and say what still bothers you.

### 5. Add text and logo

```bash
uv run scripts/overlay.py --bg <work>/bg.png --out <final>.jpg \
  --headline "ממשיך!" --sub "אופיר לוי" --colors "#F2B705,#1D4E9E" \
  --pos bottom --tilt 4 --logo <logo> --logo-pos top-left
```

| Flag | What it does |
|---|---|
| `--pos top` / `center` / `bottom` | Places the text block. `--y 0.0`–`1.0` fine-tunes it. Put text where the face isn't: covering the face is the most common way to ruin a poster. |
| `--font karantina` | The default. A tall, condensed sports display face, for short punchy headlines. |
| `--font rubik` | Heavy and round. Better for longer or English headlines ("WELCOME JAKE"). |
| `--tilt 3` to `6` | Adds energy (Arena magic). Use 0 for Framed card. |
| `--colors` | The first color is the headline glow. The second is the brush banner behind the name; with one color, both use it. |
| `--logo` | Draws a logo in the top corner. A logo with no transparency gets its flat background knocked out. If the knock-out eats into the logo, pass `--logo-keep-bg`. |

Without text or a logo, skip this step and copy `bg.png` to the final path as a `.jpg`.

### 6. Review and deliver

`Read` the final image. Check that:

- the text reads at a glance and doesn't touch the face
- the Hebrew runs right to left (not mirrored)
- the logo isn't clipped or fringed
- nothing important sits in the outer 5%, which apps crop

Fix it with `overlay.py` flags, which cost nothing, rather than regenerating.

By default, save the final poster next to the original photo as `<photo-name>-poster.jpg`. Tell the user:

- the path
- the style you chose and why, in one line
- which inputs you inferred (colors, the text split)

Offer one specific variation, e.g. "want a version with the text on top?" or "a story-size crop?".

## Banner mode

The home page shows up to three featured posts in a carousel (`frontend/src/components/FeaturedPosts.vue`). A post's
image fills the slide behind a dark bottom-up gradient, and the site draws the post's **title** and a "read more"
button over the bottom-right (RTL start). The slide is about 2.85:1 on desktop and about 1.1:1 on a phone, and the
image is center-cropped (`object-cover`) to whichever applies. So a banner is different from a poster in three ways:

- **No text and no logo in the image.** The site draws the title itself, and a second baked-in title would clash with
  it. Skip `overlay.py` entirely. If the user gives a headline, it becomes the post's title, not part of the image.
- **Only the center is safe.** A phone shows just the middle ~40% of the width, so the player goes in the horizontal
  center. A desktop trims a little off the top and bottom, so the face doesn't touch the top edge either.
- **The lower half sits under the title.** Keep the face in the upper half, and keep the bottom calm.

Steps 1-2 are the same as for a poster (Arena magic suits most banners). Then:

3. Write the prompt from the style's scene template plus the Magic layer, and end it with the **Banner zone** from
   `references/styles.md` instead of the text zone.
4. Generate with `--format banner`:

   ```bash
   uv run scripts/generate.py --format banner --prompt-file <work>/prompt.txt --out <work>/banner.png <main-photo>
   ```

5. Run the free preview, which shows the banner as the site crops and darkens it, with grey blocks where the title
   and button go:

   ```bash
   uv run scripts/preview_banner.py --banner <work>/banner.png --out <work>/preview.png
   ```

   `Read` both images. Run the step 4 checklist on `banner.png`, then check in `preview.png` that the face is whole
   and clear of the grey blocks in **both** views (the phone view is the tight one), and that nothing important is
   cut off at the sides. A face that sits too low or too far to one side needs a regeneration with the prompt saying
   exactly where it should go. A crop can't fix it, because the site always crops the center.

6. Save `banner.png` as a JPEG (quality 90, which keeps it well under the site's 10 MB upload limit) next to the
   original as `<photo-name>-banner.jpg`. Tell the user the path, and that they upload it as the post's image in the
   post editor. The carousel shows posts linked to the next or last game, then recent ones (`featuredPosts` in
   `frontend/src/lib/posts.js`). Say what title you'd suggest if they gave text.

## Limits worth knowing

- The model can drift from the person's real face. That's why step 4 compares the result with the original. Never
  ship a poster where the player doesn't look like the real person.
- Output is 1080x1350 (the Instagram portrait size) or, for the home page, the 2400x1000 banner. No story size.
