const TAU = Math.PI * 2;

const star = (c, x, y, r, points = 5, inset = 0.45) => {
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const d = i % 2 ? r * inset : r;
    c[i ? 'lineTo' : 'moveTo'](x + d * Math.cos(a), y + d * Math.sin(a));
  }
};

export const TRANSITIONS = {
  lateral: {
    ms: 900,
    shape: (c, W, H, p) => c.rect(0, 0, p * W, H),
  },
  diagonal: {
    ms: 1100,
    shape: (c, W, H, p) => {
      const d = p * (W + H);
      c.moveTo(0, 0);
      c.lineTo(d, 0);
      c.lineTo(0, d);
    },
  },
  barnDoor: {
    ms: 1000,
    shape: (c, W, H, p) => c.rect(((1 - p) * W) / 2, 0, p * W, H),
  },
  clock: {
    ms: 1200,
    shape: (c, W, H, p) => {
      c.moveTo(W / 2, H / 2);
      c.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + p * TAU);
    },
  },
  star: {
    ms: 1400,
    shape: (c, W, H, p) => star(c, W / 2, H / 2, p * 3 * Math.hypot(W, H) / 2),
  },
  irisOut: {
    ms: 1000,
    shape: (c, W, H, p) => c.arc(W / 2, H / 2, (p * Math.hypot(W, H)) / 2, 0, TAU),
  },
  irisIn: {
    ms: 1000,
    shape: (c, W, H, p) => {
      const r = ((1 - p) * Math.hypot(W, H)) / 2;
      c.rect(0, 0, W, H);
      c.moveTo(W / 2 + r, H / 2);
      c.arc(W / 2, H / 2, r, 0, TAU, true);
    },
  },
};
