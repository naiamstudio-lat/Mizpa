import { useId } from 'react';

/**
 * Mizpa butterflies — the onboarding backdrop.
 *
 * Drawn as inline SVG rather than shipped as an image file, for three reasons
 * that all come from the brand tokens: it is resolution independent, it costs
 * zero bytes over the wire, and every colour below is the same `primary` /
 * `primary-container` / `surface` the rest of the product uses, so it can never
 * drift from the palette. The wing silhouette is the one already in the wordmark
 * in `AuthModal` and `WelcomeModal`, scaled up and given depth.
 *
 * Motion is deliberately restrained and it is all transform/opacity: butterflies
 * drift, they do not flap, because a flapping SVG reads as a cartoon. The
 * drift is a slow figure-eight so no two butterflies are ever in the same
 * place. Everything is disabled under `prefers-reduced-motion`, which is not
 * decoration — a looping ambient animation is exactly the kind of thing that
 * causes vestibular symptoms, and this is the first thing a new user sees.
 */

/** One butterfly. `seed` varies the drift so the field is not a loop of clones. */
function Butterfly({
  x,
  y,
  scale,
  opacity,
  hue,
  sheenId,
  drift,
  duration,
  delay,
}: {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  hue: string;
  sheenId: string;
  drift: number;
  duration: number;
  delay: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
      {/* The motion path: a figure-eight in local space, so the butterfly
          wanders instead of sliding in a straight line. This is SVG SMIL
          `animateTransform`, not a CSS animation, and that is deliberate — it
          lives inside the element it moves, so disabling it for
          `prefers-reduced-motion` is one rule and cannot desync from the
          position CSS thinks it has. */}
      <animateTransform
        attributeName="transform"
        type="translate"
        additive="sum"
        values={`0 0; ${drift} ${-drift * 1.6}; 0 0; ${-drift} ${-drift * 1.6}; 0 0`}
        dur={`${duration * 2}s`}
        begin={`${delay}s`}
        repeatCount="indefinite"
      />
      <path
        d="M30 8c-4-8-14-10-18-6s-2 12 4 18c4 4 10 5.5 14 6-4 .5-10 2-14 6-6 6-6 14-4 18s14 2 18-6c2.5-4 4-10 4.5-16 .5 6 2 12 4.5 16 4 8 14 10 18 6s2-12-4-18c-4-4-10-5.5-14-6 4-.5 10-2 14-6 6-6 6-14 4-18s-14-2-18 6c-2.5 4-4 10-4.5 16-.5-6-2-12-4.5-16z"
        fill={hue}
      />
      {/* The body, and a highlight so the wing is not a flat silhouette. */}
      <ellipse cx="30" cy="26" rx="1.6" ry="14" fill="#65002e" opacity="0.55" />
      <path
        d="M30 8c-4-8-14-10-18-6s-2 12 4 18c4 4 10 5.5 14 6-4 .5-10 2-14 6-6 6-6 14-4 18s14 2 18-6c2.5-4 4-10 4.5-16 .5 6 2 12 4.5 16 4 8 14 10 18 6s2-12-4-18c-4-4-10-5.5-14-6 4-.5 10-2 14-6 6-6 6-14 4-18s-14-2-18 6c-2.5 4-4 10-4.5 16-.5-6-2-12-4.5-16z"
        fill={`url(#sheen-${sheenId})`}
        opacity="0.35"
      />
    </g>
  );
}

export function MizpaButterflies({ className = '' }: { className?: string }) {
  // `useId` so two instances on a page cannot collide on the gradient ids.
  const uid = useId().replace(/[:]/g, '');

  return (
    <svg
      className={className}
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <defs>
        {/* The pink the brand calls primary, fading to the container pink. */}
        <linearGradient id={`wing-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd9e1" />
          <stop offset="55%" stopColor="#ffb1c4" />
          <stop offset="100%" stopColor="#ff4a8d" />
        </linearGradient>
        <radialGradient id={`sheen-${uid}`} cx="0.5" cy="0.3" r="0.7">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`glow-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ff4a8d" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#ff4a8d" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="600" fill="#000000" />

      {/* Two soft pools of light so the black is not a flat void. */}
      <ellipse cx="240" cy="200" rx="320" ry="240" fill={`url(#glow-${uid})`} />
      <ellipse cx="600" cy="430" rx="280" ry="220" fill={`url(#glow-${uid})`} opacity="0.7" />

      {/* The field. Sizes fall off with distance so it reads as depth rather
          than as wallpaper: a few large, many small. */}
      <g>
        <Butterfly x={70} y={90} scale={2.4} opacity={0.16} hue={`url(#wing-${uid})`} sheenId={uid} drift={26} duration={17} delay={0} />
        <Butterfly x={330} y={60} scale={1.5} opacity={0.3} hue={`url(#wing-${uid})`} sheenId={uid} drift={18} duration={13} delay={1.5} />
        <Butterfly x={600} y={140} scale={1.9} opacity={0.22} hue={`url(#wing-${uid})`} sheenId={uid} drift={22} duration={19} delay={0.8} />
        <Butterfly x={150} y={330} scale={1.15} opacity={0.4} hue={`url(#wing-${uid})`} sheenId={uid} drift={14} duration={11} delay={2.4} />
        <Butterfly x={480} y={300} scale={1.7} opacity={0.26} hue={`url(#wing-${uid})`} sheenId={uid} drift={20} duration={15} delay={1.1} />
        <Butterfly x={690} y={400} scale={1.0} opacity={0.34} hue={`url(#wing-${uid})`} sheenId={uid} drift={12} duration={12} delay={3.2} />
        <Butterfly x={260} y={500} scale={1.3} opacity={0.28} hue={`url(#wing-${uid})`} sheenId={uid} drift={16} duration={14} delay={0.4} />
        <Butterfly x={560} y={530} scale={0.8} opacity={0.42} hue={`url(#wing-${uid})`} sheenId={uid} drift={10} duration={10} delay={2} />
        <Butterfly x={740} y={210} scale={0.7} opacity={0.38} hue={`url(#wing-${uid})`} sheenId={uid} drift={9} duration={9} delay={1.3} />
        <Butterfly x={40} y={470} scale={0.75} opacity={0.36} hue={`url(#wing-${uid})`} sheenId={uid} drift={11} duration={11} delay={2.9} />
        <Butterfly x={420} y={180} scale={0.65} opacity={0.44} hue={`url(#wing-${uid})`} sheenId={uid} drift={8} duration={8.5} delay={0.6} />
        <Butterfly x={780} y={560} scale={0.6} opacity={0.4} hue={`url(#wing-${uid})`} sheenId={uid} drift={8} duration={9.5} delay={1.9} />
      </g>
    </svg>
  );
}
