const COLORS = ["var(--accent)", "#f5b942", "#ffffff"];

function buildParticles(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (360 / count) * i + (i % 2 === 0 ? 6 : -6);
    const rad = (angle * Math.PI) / 180;
    const dist = 46 + ((i * 37) % 34);
    return {
      key: i,
      dx: Math.cos(rad) * dist,
      dy: Math.sin(rad) * dist - 20,
      rot: (i * 53) % 360,
      color: COLORS[i % COLORS.length],
      delay: (i % 4) * 25,
    };
  });
}

export default function Confetti({ count = 12 }: { count?: number }) {
  const particles = buildParticles(count);
  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible">
      {particles.map((p) => (
        <span
          key={p.key}
          className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-sm"
          style={{
            backgroundColor: p.color,
            animation: `confetti-fall 850ms ease-out ${p.delay}ms forwards`,
            ["--cx" as string]: `${p.dx}px`,
            ["--cy" as string]: `${p.dy}px`,
            ["--cr" as string]: `${p.rot}deg`,
          }}
        />
      ))}
    </span>
  );
}
