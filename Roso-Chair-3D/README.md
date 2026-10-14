# Roso Chair 3D — V4

This directory hosts a mobile-oriented Three.js diagnostic viewer for a **conceptual** continuous twisted ribbon surface. It is not a verified reconstruction of the original chair geometry.

- `index.html`: responsive Three.js WebGL viewer, with OrbitControls, axes, wireframe and error status.
- Geometry: procedural preview with nominal X span 2000 mm. No rebar, no thickness.
- Uses CDN-hosted Three.js; requires internet access.
- STEP/GLB CAD artifacts are **not** part of this deployment yet.

To publish from this private repository, verify GitHub Pages eligibility for the account, then configure Pages (Settings → Pages). For a subdirectory, use a GitHub Actions deployment workflow or move the site to a Pages publishing root.
