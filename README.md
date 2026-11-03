# website-tv

A website that looks and feels like playing an old DVD on a CRT.

```sh
pnpm install
pnpm dev
```

- `src/lib/tv.js`: the TV effect (composite signal, beam, phosphor mask, transitions)
- `src/routes/+page.svelte`: main page
- Videos: served from the R2 bucket at `tv-website-assets.roccopunghellini.com`, which needs a CORS policy allowing the site's origin
- `static/files/`: local copy of the videos, used if R2 fails (not in git)
- `prototypes/`: the original standalone experiments, see `prototypes/README.md`

## Controls

- **First click / key**: unmute (a first click only unmutes, it doesn't pause)
- **H**: show / hide the video dropdown and timeline (hidden by default)
- **M**: mute / unmute
- **P / click**: play / pause
- **F**: freeze the current field briefly
- **Space**: next video with a random transition
- **← / →**: jump 5 s back / forward
