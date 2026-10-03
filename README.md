# snow on mars

A multilayered site modeled on rough opal.

## Layout

```
public/              ← everything the site serves
  index.html
  css/style.css
  js/shaders.js      ← GLSL: pockets, Bragg play-of-colour, grain dissolve
  js/sketch.js       ← p5: random layout, taps, timing, viewing angle, events
  js/vendor/p5.min.js
amplify.yml          ← tells AWS Amplify to serve /public as-is
```

## Layer 0 — the black field
- Starts fully black, no text.
- Every load scatters hidden pockets at random. Every one is opal (black, crystal or fire) and reveals when tapped; the black space between them does nothing.
- Tapping a live pocket opens it outward from the tap point. Colour follows Bragg diffraction, λ = 2·n·(0.816·D)·cosθ, with θ set by the cursor or phone tilt.
- After ~9 s it breaks down: the colour slides toward violet (the spheres "shrink") and the pocket dissolves into grains from the rim inward.
- Events for future layers: `opal:open` {index, variety, x, y} and `opal:potch` {index, x, y}.
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
