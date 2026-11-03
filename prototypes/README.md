# Prototypes

## Run

`tv.html` loads `transitions.js` as an ES module, so it must be served over HTTP. Opening it with `file://` won't work.

```sh
npx http-server -p 8000   # from the repo root
```

Then open http://localhost:8000/prototypes/tv.html

`tv-webgl.html` is an experimental WebGL2 version with a simulated electron beam (Gaussian scanlines whose width grows with brightness). It has no scanline/resolution toggles.

`tv-composite.html` is `tv-webgl.html` with a simulated NTSC composite signal: color is modulated onto brightness, then separated and demodulated, which produces dot crawl and rainbows. See `SEPARATION` and `COMPOSITE_SHARPENING` at the top of the file.

The server must support HTTP range requests, otherwise the timeline slider can't seek. `python3 -m http.server` and `php -S` don't.

Videos are loaded from `../static/files/` (see `FILES` in `tv.html`).

## Controls

- **Click / any key**: unmute
- **Space**: next video with a random transition
- **Click on screen**: freeze the current field briefly
- **Dropdown** (bottom left): pick a video
- **Slider** (bottom): move through the current video
- **M**: mute / unmute (WebGL version)
- **← / →**: jump 5 s back / forward (WebGL version)
- **Enter**: play / pause (WebGL version)
- **Low res** checkbox: toggle the forced CRT resolution vs native screen resolution
