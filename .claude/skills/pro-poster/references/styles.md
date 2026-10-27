# Poster styles

Three looks, each taken from a real club graphic. Every template ends with the shared **Magic layer** and the
**text zone**: paste both into each prompt. `{C1}` / `{C2}` stand for the theme colors as "word #hex" (e.g.
"glowing gold #F2B705"). Identity, enhancement and no-text rules are added by `generate.py`, so they don't go here.

## Magic layer (append to every prompt)

The "magic" is mostly light. Layered light reads as expensive, flat light reads as a cut-out.

```
Lighting and finish: dramatic night lighting with a strong {C1} rim light tracing the player's silhouette, soft
volumetric light rays from behind, a burst of glowing {C1} and {C2} particles, glitter and tiny confetti shards
swirling behind and around the player (never over the face), a few four-point sparkle stars, subtle lens flare,
shallow depth of field with creamy bokeh, rich cinematic color grade in the {C1}/{C2} palette, crisp detail on the
player, gentle film grain. Premium sports-marketing key art, the quality of an official club social media graphic.
```

## Text zone (append to every prompt with text)

`{TEXT_ZONE}`: "Keep the lower 30% of the frame darker and calmer, free of important detail, for a headline to be
added later." Use "upper 25%" when the face sits low, or leave it out when the poster has no text.

## Banner zone (use instead of the text zone for `--format banner`)

The site crops the banner differently per screen and draws the post title over its lower half, so the composition
has to survive both crops:

```
Wide cinematic banner. Place the player dead centre horizontally, in the middle third of the width, and keep the head
and face between 15% and 45% of the frame height: not touching the top edge, never in the lower half. The scene
extends to the far left and right edges with atmosphere only (crowd, lights, haze, particles), no second focal point
and nothing important near the sides, since they get cropped away on phones. Keep the lower 45% of the frame calmer
and darker, without bright highlights, for a title to be added on top later.
```

A full-body photo usually won't fit: the face would sit too low. Frame the player from the waist or chest up.

---

## 1. Arena magic

*Reference: Maccabi Jerusalem "ממשיך!" (a re-signing). Player cut out over a packed arena, light, confetti
explosion, a hoop in the corner.*

**Best for:** one strong action or pose photo, and signings, re-signings, MVP, player of the game or game day.

```
Place the player from image 1, full body or as framed in the photo, in the center of a packed indoor basketball
arena at night, seen from court level. Behind them: tiers of a blurred cheering crowd in {C1} and {C2} shirts,
bright stadium floodlights in the upper rafters, a basketball hoop and net at the top corner of the frame, on the side
opposite the player's face, angled toward the viewer. A polished hardwood court floor in the foreground reflects the
player and the lights. An explosion of {C1} glitter, confetti shards and glowing dust erupts from behind the player's
shoulders like a shockwave. The player is the brightest, sharpest element.
```

Overlay: `--font karantina --tilt 4 --pos bottom`, with the name on the brush banner (`--sub`).

## 2. Editorial collage

*Reference: the ESPN-style Rockets / Spurs / Mavericks piece. Several players cut out on a flat, printed-paper
background.*

**Best for:** 2–4 people (the extra images), roster announcements, "players to watch", matchups.

```
Create a magazine-editorial collage of the players from the provided images, each cleanly cut out at waist height
and placed side by side, slightly overlapping, the main player (image 1) in the center and a little larger. The
background is a flat, matte paper texture in a muted tint of {C1}, with subtle halftone dots, light paper grain and
a faint torn-paper edge. Render the center player in full color and the side players in full color too, with a thin
white cut-out outline around each figure like a printed sticker. Bold, graphic, clean: no arena, no crowd.
```

Make the Magic layer softer for this style: replace its first sentence with "soft directional studio light with a
gentle {C1} rim light", and drop the particle burst for a few small sparkle stars.

Overlay: `--font rubik --tilt 0 --pos bottom`. Usually a headline only.

## 3. Framed card

*Reference: Milwaukee Bucks "WELCOME JAKE STEPHENS". Clean gradient, thin geometric frame, the player inside a circle
that they break out of.*

**Best for:** one portrait or emotional photo, welcome or signing announcements, a clean and official tone.

```
A clean, premium announcement card. Background: a smooth vertical gradient from deep {C1} to almost black, with thin
light-{C1} hairline frame lines inset from the edges, small crosshair marks where lines meet, and a faint dot-grid
texture in the corners. In the lower two-thirds, a large circle shows the player from image 1 from the waist up
against a softly blurred arena background, and the player's head and shoulders break out over the top edge of the
circle for depth. The upper third is empty gradient, reserved for a logo and a headline.
```

Use `{TEXT_ZONE}` = "Keep the upper 30% empty." Overlay: `--font rubik --tilt 0 --pos top`, with the logo centered
by eye. `overlay.py` places logos in corners only, so put the logo in a corner and keep the text centered.

---

## Fixing a bad generation

| Symptom | Change to the prompt |
|---|---|
| The face drifted | Add "the face must be pixel-faithful to image 1", and keep effects away from the head. |
| The skin looks plastic or airbrushed | Add "keep natural skin texture and pores; light-touch cleanup only". |
| It looks pasted on | Ask for "matching ambient light and colored bounce light from the scene on the player's skin and jersey" and a "contact shadow / floor reflection". |
| It's too busy, so the text won't read | Cut the confetti density: "a restrained scatter of particles", and restate `{TEXT_ZONE}`. |
| Pseudo-text appears on banners or boards | Add "plain unbranded LED boards, blank banners". |
| It's off-palette | Repeat the hex colors in the arena description, not only in the Magic layer. |
