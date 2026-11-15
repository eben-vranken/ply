<script lang="ts">
  // Birch: Ply's mascot. A small birch pawn in a blue scarf: the piece everyone starts as,
  // and the one that gets to become anything. Round, soft and on your side; the face and
  // the little arms react to how you are doing, and it breathes while it waits.
  export type Mood = 'idle' | 'cheer' | 'sad' | 'think' | 'wow' | 'sleep';
  let { mood = 'idle', size = 56, still = false }: { mood?: Mood; size?: number; still?: boolean } = $props();
  const W = '#5a3d22'; // warm outline
  const INK = '#2b1c10';
  const up = $derived(mood === 'cheer' || mood === 'wow');
  // eyes drift up and aside while thinking
  const ex = $derived(mood === 'think' ? 1.2 : 0);
  const ey = $derived(mood === 'think' ? -1.6 : mood === 'sad' ? 0.8 : 0);
  const er = $derived(mood === 'wow' ? [2.9, 3.5] : [2.3, 2.9]);
</script>

<svg class="m {mood}" class:still width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Birch, the Ply pawn">
  <ellipse class="shade" cx="32" cy="60.500" rx="16" ry="2.400" fill="#0b0e24" opacity="0.2" />
  <g class="body">
    {#if mood === 'cheer'}
      <g class="sparks" fill="#f4b740">
        <path d="M8 9l1.300 3 3 1.300-3 1.300-1.300 3-1.300-3-3-1.300 3-1.300z" />
        <path d="M57 4l1 2.300 2.300 1-2.300 1-1 2.300-1-2.300-2.300-1 2.300-1z" />
        <circle cx="55" cy="21" r="1.500" />
      </g>
    {/if}
    <!-- arms: down at rest, thrown up when something good happens -->
    <g fill="#e9d2a8" stroke={W} stroke-width="2">
      {#if up}
        <ellipse class="arm l" cx="15.500" cy="33.500" rx="3.300" ry="5" transform="rotate(-38 15.500 33.500)" />
        <ellipse class="arm r" cx="48.500" cy="33.500" rx="3.300" ry="5" transform="rotate(38 48.500 33.500)" />
      {:else}
        <ellipse cx="19" cy="43.500" rx="3.200" ry="4.800" transform="rotate(20 19 43.500)" />
        <ellipse cx="45" cy="43.500" rx="3.200" ry="4.800" transform="rotate(-20 45 43.500)" />
      {/if}
    </g>
    <!-- foot and belly -->
    <rect x="14.500" y="50" width="35" height="9" rx="4.500" fill="#c9a873" stroke={W} stroke-width="2.200" />
    <path d="M20 52c0-9 4-12 4.500-18.500h15c.5 6.500 4.500 9.500 4.500 18.500z" fill="#e9d2a8" stroke={W} stroke-width="2.200" stroke-linejoin="round" />
    <path d="M24 46.500q8 3 16 0" fill="none" stroke="#d2b382" stroke-width="1.500" stroke-linecap="round" />
    <!-- the scarf: one stained veneer -->
    <path d="M34.500 35l1.700 8.200 4.300-.9-1.500-7.600z" fill="#4c69cf" stroke={W} stroke-width="2" stroke-linejoin="round" />
    <rect x="19" y="29.500" width="26" height="7.500" rx="3.750" fill="#6584e2" stroke={W} stroke-width="2.200" />
    <path d="M24 33.200h6" stroke="#9db0ff" stroke-width="1.600" stroke-linecap="round" opacity="0.8" />

    <g class="head">
      <circle cx="32" cy="18" r="15" fill="#f6e7c8" stroke={W} stroke-width="2.200" />
      <path d="M21.500 12q4.200-6.200 10.500-6.800" fill="none" stroke="#fff" stroke-width="2.400" stroke-linecap="round" opacity="0.75" />
      <ellipse cx="21.800" cy="24" rx="3" ry="2.200" fill="#f29b8a" opacity="0.55" />
      <ellipse cx="42.200" cy="24" rx="3" ry="2.200" fill="#f29b8a" opacity="0.55" />
      <g fill="none" stroke={INK} stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round">
        {#if mood === 'cheer'}
          <path d="M23.300 20.500q2.700-3.800 5.400 0M35.300 20.500q2.700-3.800 5.400 0" />
          <path d="M28.300 23.800q3.700 5.800 7.400 0z" fill="#d9634c" />
        {:else if mood === 'sleep'}
          <path d="M23.300 19.800q2.700 2.200 5.400 0M35.300 19.800q2.700 2.200 5.400 0" />
          <path d="M30.500 25q1.500 1 3 0" />
          <path class="zz" d="M47 6h4l-4 4.500h4" stroke-width="2" stroke="#b08a57" />
        {:else}
          <g class="open" stroke="none">
            <ellipse cx={26 + ex} cy={19.800 + ey} rx={er[0]} ry={er[1]} fill={INK} />
            <ellipse cx={38 + ex} cy={19.800 + ey} rx={er[0]} ry={er[1]} fill={INK} />
            <circle cx={26.900 + ex} cy={18.600 + ey} r={mood === 'wow' ? 1.200 : 0.900} fill="#fff" />
            <circle cx={38.900 + ex} cy={18.600 + ey} r={mood === 'wow' ? 1.200 : 0.900} fill="#fff" />
          </g>
          {#if mood === 'sad'}
            <path d="M22.600 16.400l5-1.700M41.400 16.400l-5-1.700" stroke-width="1.900" />
            <path d="M29.600 26.200q2.400-2 4.800 0" />
          {:else if mood === 'think'}
            <path d="M30.800 25.200h3.400" />
            <g class="dots" fill="#b08a57" stroke="none"><circle cx="50" cy="8" r="1.300" /><circle cx="54.500" cy="5" r="1.700" /><circle cx="59.500" cy="1.500" r="2.100" /></g>
          {:else if mood === 'wow'}
            <ellipse cx="32" cy="25.600" rx="1.900" ry="2.300" fill={INK} stroke="none" />
          {:else}
            <path d="M29.300 24.300q2.700 2.800 5.400 0" />
          {/if}
        {/if}
      </g>
    </g>
  </g>
</svg>

<style>
  .m { display: block; flex: none; overflow: visible; }
  .body { transform-origin: 32px 59px; animation: breathe 3.6s ease-in-out infinite; }
  .head { transform-origin: 32px 31px; }
  .open { transform-origin: 32px 20px; animation: blink 4.8s infinite; }
  .cheer .body { animation: hop 640ms var(--spring) both, breathe 3.6s ease-in-out 640ms infinite; }
  .wow .body { animation: hop 460ms var(--spring) both; }
  .sad .head { animation: droop 560ms var(--ease) both; }
  .think .head { animation: tilt 700ms var(--ease) both; }
  .sleep .body { animation-duration: 5.2s; }
  .sparks path, .sparks circle { transform-box: fill-box; transform-origin: center; animation: twinkle 900ms var(--spring) 180ms both; }
  .sparks path:nth-child(2) { animation-delay: 320ms; }
  .dots circle { opacity: 0; animation: dot 500ms var(--ease) both; }
  .dots circle:nth-child(1) { animation-delay: 300ms; }
  .dots circle:nth-child(2) { animation-delay: 480ms; }
  .dots circle:nth-child(3) { animation-delay: 660ms; }
  .zz { animation: zz 2.6s ease-in-out infinite; }
  .still .body, .still .open, .still .head { animation: none; }
  @keyframes breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.025, 0.98); } }
  @keyframes blink { 0%, 46%, 50%, 100% { transform: scaleY(1); } 48% { transform: scaleY(0.1); } }
  @keyframes hop { 0% { transform: translateY(0) scale(1); } 35% { transform: translateY(-10px) scale(0.97, 1.05); } 70% { transform: translateY(0) scale(1.05, 0.95); } 100% { transform: none; } }
  @keyframes droop { to { transform: rotate(-7deg) translateY(1px); } }
  @keyframes tilt { to { transform: rotate(7deg); } }
  @keyframes twinkle { 0% { opacity: 0; transform: scale(0) rotate(-40deg); } 60% { opacity: 1; transform: scale(1.25) rotate(8deg); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes dot { to { opacity: 0.75; } }
  @keyframes zz { 0%, 100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 0.9; transform: translateY(-2px); } }
</style>
