# Hilbert Space

An interactive 3D Hilbert curve explorer built with Three.js and Vite.

**Live site:** https://hallojoe.github.io/hilbert-space/

## Explore

- Orders 1–6: 8 to 262,144 points on a complete, face-adjacent cubic grid.
- Reveal an exact number of points with a slider or numeric input. Play the reveal over 5–60 seconds, with optional looping.
- Wireframe path, shaded cylinders, procedurally textured cylinders, and GPU-animated blinking dots.
- Spectrum, aurora, ember, and lime palettes; adjustable dot size and pulse speed.
- Drag to orbit, scroll/pinch to zoom, right-drag or use two fingers to pan. Camera presets, X/Y/Z rotation, auto rotation, speed, and reset are also available.
- Toggle the bounding cube, enter fullscreen where supported, or download a transparent PNG of the current view.
- Responsive controls and reduced-motion support: pulsing defaults off when reduced motion is requested; animation and rotation start only on user action.

Order means `8 ** order` vertices. Revealing N vertices draws N−1 connected segments in path modes; zero shows no curve and one shows the starting point. Increasing order preserves the revealed proportion. High orders are best explored in wireframe or dots on slower devices.

## Development

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:browser
```

The production bundle is in `dist/`. Relative asset paths support both the GitHub Pages project URL and a custom domain. Fonts load from Google Fonts with local system fallbacks; the renderer and all geometry/texture assets are bundled locally.

## GitHub Actions / Pages

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** (already enabled for this repository).

- `ci.yml` validates pull requests and can be called by the deployment workflow. It verifies every supported curve order, builds the app, and runs Chromium desktop/mobile interaction tests. Screenshots and failure traces are retained as artifacts.
- `pages.yml` runs on pushes to `main` or manually through Actions. It calls validation, then deploys the verified build with the official Pages actions and the `github-pages` environment. No repository secrets are required.

## Rendering notes

The curve uses Three.js `GeometryUtils.hilbert3D` with its iteration offset translated to the familiar order convention. Shaded and textured modes use instanced cylinders; blinking dots use a point-sprite shader with independent phases and soft additive glow. The dot effect is inspired by [Three.js's instanced-points example](https://github.com/mrdoob/three.js/blob/master/examples/webgpu_instance_points.html), implemented using WebGL rather than requiring WebGPU. Finite orders approximate the limiting space-filling curve.
