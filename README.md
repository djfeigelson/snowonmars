# snow on mars

A multilayered site modeled on rough opal.

## Layout

```
public/              ← everything the site serves
  index.html
  css/style.css
  js/shaders.js      ← GLSL: stone, rubbed window, Bragg play-of-colour
  js/sketch.js       ← p5: rubbing, clouding over, viewing angle, events
  js/vendor/p5.min.js
amplify.yml          ← tells AWS Amplify to serve /public as-is
```

## Layer 0 — "the rough"
- Drag to rub a window into the stone; it fogs (milky, like drying hydrophane) and closes after ~15–25 s.
- Colour = Bragg diffraction per grain: λ = 2·n·(0.816·D)·cosθ. Cursor / phone tilt sets θ.
- Lifetime rubbing raises `depth` (saved in the browser), which makes large-sphere (red) grains more common.
- Future layers can listen for `window` event `opal:reveal` → `{ open, depth }`.
- Tuning knobs: `CONFIG` at the top of `js/sketch.js`.

## Preview locally
Open `public/index.html` in a browser (works straight from disk).

## Publish
```
git add .
git commit -m "describe the change"
git push
```
AWS Amplify rebuilds and the domain updates in about a minute.
