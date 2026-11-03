<script>
	import { onMount } from 'svelte';
	import { startTv } from '#lib/tv.js';

	let v0, v1, tube, pick, seek;
	let controlsVisible = $state(false);

	onMount(() => startTv({ tube, pick, seek, vids: [v0, v1] }));

	function toggleControls(e) {
		if (e.code === 'KeyH' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
			controlsVisible = !controlsVisible;
		}
	}
</script>

<svelte:head>
	<title>Old TV</title>
</svelte:head>

<svelte:window onkeydown={toggleControls} />

<video bind:this={v0} crossorigin="anonymous" muted loop playsinline></video>
<video bind:this={v1} crossorigin="anonymous" muted loop playsinline></video>
<canvas bind:this={tube}></canvas>
<ul class="legend">
	<li><kbd>h</kbd> controls</li>
	<li><kbd>m</kbd> mute</li>
	<li><kbd>p</kbd> / click pause</li>
	<li><kbd>f</kbd> freeze</li>
	<li><kbd>space</kbd> next</li>
</ul>
<div class="ui" hidden={!controlsVisible}>
	<select bind:this={pick}></select>
	<input bind:this={seek} type="range" min="0" max="1" step="any" value="0" aria-label="Timeline" />
</div>

<style>
	:global(body) {
		margin: 0;
		background: #000;
	}
	video,
	canvas {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.ui {
		position: fixed;
		bottom: 16px;
		left: 16px;
		right: 16px;
		display: flex;
		gap: 8px;
	}
	.ui[hidden] {
		display: none;
	}
	input {
		flex: 1;
	}
	.legend {
		position: fixed;
		top: 16px;
		left: 16px;
		margin: 0;
		padding: 0;
		list-style: none;
		color: #fff;
		font: 12px/1.5 monospace;
		text-shadow: 0 0 2px #000;
		pointer-events: none;
	}
	kbd {
		font: inherit;
		font-weight: bold;
	}
</style>
