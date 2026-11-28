---
name: player-card
description: >-
  Makes the site's house-style player card (1080x1350) from a player photo: the player chest-up over a dark
  team-color gradient with a glowing halo ring, arena bokeh, thin inset frame, the club logo top-left, the big jersey
  number and the Hebrew name on a brush banner. These cards are the main player image on the roster and player pages
  (see gush-ball.site/<team>/roster), so every card must match the existing ones. Use this whenever the user wants a
  player image, roster photo, player card, "main image for the player page", or "make him look like the others",
  for one player or a whole roster, and also when they hand over a player photo plus a name or number without saying
  what to make. For a social announcement poster (signing, MVP, game day) or a home-page banner, use pro-poster.
argument-hint: "<team url|slug|id> [photo] [jersey] [name] | <team> all"
allowed-tools: Bash, PowerShell, Read, Write, Glob
---

# Player card

Every player on a team's roster page should look like part of one set. `assets/reference-card.jpg` is the look:
read it before your first card in a session. A card that drifts from it (no halo, a different crop, the number in
another place) is a failed card even if it looks good on its own, because it breaks the roster grid.

The look is locked: one prompt template (`references/prompt.tpl`) and one set of overlay flags. Only the team colors,
the logo, the photo, the number and the name change. Don't restyle per player.

The engine is pro-poster's two scripts, reused as-is (paths relative to this skill's folder):

- `../pro-poster/scripts/generate.py` builds the scene with an image model (face and clothing kept, no text).
- `../pro-poster/scripts/overlay.py` adds the number, the name and the logo with real fonts, since image models
  garble Hebrew.

Both run with `uv run`. They need `GEMINI_API_KEY` or `OPENAI_API_KEY`; without one, stop and point the user to
`../pro-poster/references/api-keys.md`. Each generation costs a few cents.

## 1. Gather the inputs

Work in a folder in the scratchpad. The live site has everything, so ask only for what it can't give you.

**Team: colors and logo.** `curl -s https://gush-ball.site/api/teams` lists every team with `id`, `name_en`,
`primary_color`, `secondary_color` and `logo_url`. A site URL like `gush-ball.site/elitzur_gush_etzion` names the
team by its slug, which is `name_en` lowercased, with non `[a-z0-9_ ]` characters dropped and spaces turned into
`_` (or the id when `name_en` is empty). Colors the user gives override the API's.

**Players.** `curl -s https://gush-ball.site/api/teams/<id>/players` gives each player's `name` (Hebrew),
`jersey_number`, `is_coach` and `images`; `images[0]` is the main image. For one player with a photo from the user,
take the name and number from here when the user doesn't give them, and confirm when the match is a guess.

**Downloads.** The image host returns 403 to clients without a browser User-Agent, so use
`curl -s -A "Mozilla/5.0" -o <file> <url>`. When parsing the API's JSON on Windows, read it as UTF-8 (`python -X utf8`).

**Whole roster.** A main image that is exactly 1080x1350 is almost always a card already: skip those players and
list them, unless the user asks to redo them. Make cards only for the rest.

## 2. Pick the two colors

The template needs a background color `{BG}` and an accent `{ACCENT}`:

- `{BG}` is the darker of the two team colors. It becomes the gradient, the glow and the bokeh.
- `{ACCENT}` is the lighter one. It becomes the frame lines, the halo ring, the rim light and the sparkles.

Write each as a color word plus hex, e.g. `deep indigo #19006b` and `white #FFFFFF`, or `royal blue #013fbc` and
`golden yellow #fce15d`. If the darker color is still light (a pastel or bright yellow), use a deep, near-black shade
of it as `{BG}`, or the card loses its dark, premium look.

## 3. Study the photo, write the prompt

`Read` the photo. Note the face (it must survive unchanged), the clothing, and anything that will fight the card:
other people, a tiny or blurry face, a hand over the face.

Fill `references/prompt.tpl` into `<work>/p_<jersey>.txt`: `{BG}`, `{ACCENT}`, and `{SUBJECT}`:

- one person: `the person in image 1`
- a group photo: name the player by what is visible, e.g. `only the front player in image 1 (white jersey number 5,
  holding the ball); remove the other player`. A face that is small in a group photo comes out weaker and is the most
  likely card to drift from the set. If that happens, crop the photo to that player first and generate from the crop.

Don't add anything else to the prompt. The framing numbers in it (head top at 18%, chest ending at 70%, a calm
lower 30%) are what make every card line up with the others and leave room for the number and name.

## 4. Generate

```bash
uv run ../pro-poster/scripts/generate.py --prompt-file <work>/p_<jersey>.txt --out <work>/bg_<jersey>.png <photo>
```

For a roster, run four at a time (`xargs -P 4`). Then `Read` each background and compare it with the source photo
and with `assets/reference-card.jpg`:

- [ ] The face is clearly the same person, with natural skin, not plastic and not over-sharpened.
- [ ] It is chest-up at medium distance: a face about a quarter of the width, not a close-up.
- [ ] The halo circle with its thin ring is behind the head, and the inset frame lines are there.
- [ ] The lower 30% is dark and calm (no bright shirt there), and the top-left corner is calm.
- [ ] There is no text or pseudo-lettering in the scene.

Regenerate a failed one at most twice, putting the specific fix into its prompt ("medium framing, the face takes only
a quarter of the frame width", "the face must be pixel-faithful to image 1").

A white game jersey is the known exception: it stays bright in the lower third, and its small crest and sponsor marks
come back as tiny pseudo-lettering. Prompting it darker doesn't work, and can leave the jersey's own number as a ghost
behind the overlaid one. Accept the first result when the face is right and the overlaid number reads on the white,
and tell the user about the crest.

## 5. Add the number, the name and the logo

Download `logo_url` once to `<work>/logo.jpg`. Then, with the same flags for every card:

```bash
uv run ../pro-poster/scripts/overlay.py --bg <work>/bg_<jersey>.png --out <work>/out/<jersey>_<player-id>-card.jpg \
  --headline "<jersey>" --sub "<Hebrew name>" --colors "<BG hex>,<ACCENT hex>" \
  --pos bottom --y 0.75 --font karantina --tilt 0 --logo <work>/logo.jpg --logo-pos top-left
```

- `--y 0.75` keeps the name banner clear of the bottom 5% that apps crop. Don't change it per card.
- A coach gets `--headline "מאמן"`. A player with no number gets no `--headline`, just `--sub`.
- `--colors` is the number's glow, then the name banner. The banner text turns dark on a light banner on its own.
- If the glow color blurs into the jersey behind the number (a gold glow over a yellow shirt), swap the two colors for
  that team, and use the swapped order on every card of the team so the set stays consistent.
- If the logo's background knock-out eats into the crest, add `--logo-keep-bg`.

## 6. Review and deliver

For more than one card, build a side-by-side sheet and `Read` it:

```bash
uv run scripts/compare.py --out <work>/compare.jpg <src1> <card1> <src2> <card2> ...
```

Check every pair: same person, the number and name readable, Hebrew right to left (not mirrored), the logo clean.
Then look at the riskiest one or two full size (a group photo, a tiny or dark face).

Save the cards where the user asked, otherwise in `~/Pictures/<team-slug>-cards/`. Tell the user:

- the folder, and which players you skipped (already a card, or no photo) and why
- any player whose match or name was a guess
- how to put a card live: upload it on the player's page and mark it as the main image (or use bulk image upload on
  the team), since the roster and the player page show the main image
