// Stable, local artwork. These abstract lines never represent a real route.
export function tripCardPalette(id: string) {
  let hash = 0;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return hash % 4;
}

export function TripCardArt({ id, cityName }: { id: string; cityName?: string }) {
  const colors = [
    ["#dcebe1", "#79a99a"],
    ["#eee5d4", "#c5a97b"],
    ["#dfe8ee", "#8eb0bf"],
    ["#ece1e0", "#c79b97"],
  ];
  const [paper, ink] = colors[tripCardPalette(id)];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-20 overflow-hidden rounded-xl"
      style={{ background: `linear-gradient(135deg, ${paper}, #fffefa 72%)` }}
    >
      {!cityName ? (
        <svg
          className="absolute -right-10 -top-4 h-60 w-80 opacity-30"
          viewBox="0 0 320 240"
          fill="none"
        >
          <path
            d="M 14 180 C 72 208 43 74 119 84 S 149 205 212 146 S 199 19 297 46"
            stroke={ink}
            strokeWidth="2"
            strokeDasharray="4 7"
          />
          <circle cx="119" cy="84" r="7" stroke={ink} strokeWidth="2" />
          <circle cx="212" cy="146" r="4" fill={ink} />
        </svg>
      ) : null}
    </div>
  );
}
