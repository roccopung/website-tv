# website-tv

## Run

`tv.html` loads `transitions.js` as an ES module, so it must be served over HTTP. Opening it with `file://` won't work.

```sh
npx http-server -p 8000
```

Then open http://localhost:8000/tv.html

`tv-webgl.html` is an experimental WebGL2 version with a simulated electron beam (Gaussian scanlines whose width grows with brightness). It has no scanline/resolution toggles.

The server must support HTTP range requests, otherwise the timeline slider can't seek. `python3 -m http.server` and `php -S` don't.

Videos are loaded from `files/` (see `FILES` in `tv.html`).

## Controls

- **Click / any key**: unmute
- **Space**: next video with a random transition
- **Click on screen**: freeze the current field briefly
- **Dropdown** (bottom left): pick a video
- **Slider** (bottom): move through the current video
- **Low res** checkbox: toggle the forced CRT resolution vs native screen resolution
