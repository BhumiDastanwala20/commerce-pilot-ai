const palettes = [
  ["#6366f1", "#a855f7"],
  ["#0ea5e9", "#22d3ee"],
  ["#f97316", "#facc15"],
  ["#10b981", "#84cc16"],
  ["#ec4899", "#f43f5e"],
  ["#14b8a6", "#3b82f6"],
];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export default function ProductArt({ id, name }: { id: string; name: string }) {
  const h = hash(id);
  const [a, b] = palettes[h % palettes.length];
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  return (
    <svg className="art" viewBox="0 0 240 120" role="img" aria-label={`${name} illustration`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="240" height="120" fill={`url(#g-${id})`} />
      <circle cx={40 + (h % 60)} cy="30" r="46" fill="#fff" opacity="0.14" />
      <circle cx={200 - (h % 50)} cy="100" r="58" fill="#fff" opacity="0.12" />
      <text x="120" y="72" textAnchor="middle" fontSize="40" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
        {initials}
      </text>
    </svg>
  );
}