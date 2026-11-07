# Sap City

- Live site: https://reservetempo.github.io/sap-city/

Sap City is a phone-first web game for learning computer architecture through city building: in the long run, a hierarchy of voxel buildings (gates, then adders and flip-flops, then ALUs and memory) becomes a visual language for schematic diagrams. For now the only feature is placing buildings and roads on a 32×32 grid; there are no game rules yet.

Plain HTML, CSS and JavaScript ES modules with no build step. three.js 0.170.0 loads from jsDelivr through an import map. GitHub Pages serves the `main` branch root, so anything pushed to `main` goes live within a minute or two.

## Files

```
index.html        page shell, import map, fallback message
style.css         full-screen canvas, no page scroll/zoom, safe-area insets
src/main.js       wires everything together, render loop
src/scene.js      renderer, lights, ground; tileToWorld / worldToTile helpers
src/controls.js   camera controller (pan, pinch-zoom, twist-rotate, wheel)
src/input.js      pointer router: taps, claimed drags, hover, camera hand-off
```

## Run locally

ES modules need HTTP, so serve the folder:

```sh
python -m http.server 8010
```

Then open http://localhost:8010/.
