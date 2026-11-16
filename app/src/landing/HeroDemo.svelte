<script lang="ts">
  // The hero: a real board playing the line the 1200 band's data produces. On the opponent's turn
  // the replies fan out as arrows, as thick as they are played; on yours the move's card flips
  // from New to Learned. It only runs while it is on screen, and never by itself with reduced motion.
  import type { DrawShape } from '@lichess-org/chessground/draw';
  import Board, { type Badge } from '../lib/Board.svelte';
  import Plies from '../lib/Plies.svelte';
  import Icon from '../lib/Icon.svelte';
  import { inview } from '../lib/inview';
  import { desk } from '../lib/desk.svelte';
  import { demo, num, sq, n } from './demo';

  const H = demo.hero;
  // i plies are on the board; `show` is what is being pointed at before ply i is played
  let i = $state(desk.still ? 5 : 0);
  let show = $state<'none' | 'fan' | 'hint'>(desk.still ? 'fan' : 'none');
  let learned = $state(false);
  let playing = $state(!desk.still);
  let seen = $state(false);
  let badge = $state<Badge | null>(null);
  let rev = $state(0);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fen = $derived(i ? H[i - 1].fen : demo.startFen);
  const last = $derived(i ? sq(H[i - 1].uci) : null);
  const next = $derived(H[i]);
  const done = $derived(i >= H.length);
  // the card on show: your last move, or the one about to be played
  const card = $derived(show === 'hint' && next ? next : [...H.slice(0, i)].reverse().find((p) => p.mine) ?? H[0]);
  const cardIdx = $derived(H.indexOf(card));
  const name = $derived(i ? H[i - 1] : { name: 'Starting position', eco: '' });
  const fanNow = $derived(next && !next.mine ? next.fan! : [...H.slice(0, i)].reverse().find((p) => p.fan)?.fan ?? H[1].fan!);
  const fanFor = $derived(next && !next.mine ? i : H.indexOf([...H.slice(0, i)].reverse().find((p) => p.fan) ?? H[1]));
  const shapes = $derived.by((): DrawShape[] => {
    if (!next) return [];
    if (show === 'hint') return [{ orig: next.uci.slice(0, 2) as never, dest: next.uci.slice(2, 4) as never, brush: 'good' }];
    if (show === 'fan') return next.fan!.filter((f) => f.pct >= 2).map((f, k) => ({ orig: f.uci.slice(0, 2) as never, dest: f.uci.slice(2, 4) as never, brush: k === 0 ? 'lead' : 'fan', modifiers: { lineWidth: Math.max(3, Math.round(f.pct / 4.5)) } }));
    return [];
  });

  function step() {
    if (done) { i = 0; show = 'none'; learned = false; badge = null; return 900; }
    if (show === 'none') { show = next.mine ? 'hint' : 'fan'; if (next.mine) learned = false; return next.mine ? 1100 : 1900; }
    const p = next;
    i++; show = 'none'; rev++;
    badge = p.mine ? { square: p.uci.slice(2, 4), glyph: '!', tone: 'good' } : null;
    if (p.mine) learned = true;
    return i >= H.length ? 3600 : p.mine ? 1300 : 700;
  }
  function loop() { clearTimeout(timer); if (playing && seen && !document.hidden) timer = setTimeout(() => { const wait = step(); timer = setTimeout(loop, wait - 0); }, 60); }
  $effect(() => { void playing; void seen; loop(); return () => clearTimeout(timer); });
  $effect(() => { const v = () => loop(); document.addEventListener('visibilitychange', v); return () => document.removeEventListener('visibilitychange', v); });

  function manual(d: 1 | -1) {
    playing = false; clearTimeout(timer);
    if (d === 1) { if (done) { i = 0; show = 'none'; learned = false; badge = null; return; } if (show === 'none') step(); step(); if (!done && show === 'none') step(); }
    else { i = Math.max(0, i - 1); badge = null; rev++; learned = i > 0 && H[i - 1].mine; show = i < H.length ? (H[i].mine ? 'hint' : 'fan') : 'none'; }
  }
</script>

<div class="demo" use:inview={{ on: (s) => (seen = s), threshold: 0.25 }}>
  <div class="stage">
    <Board {fen} side="w" lastMove={last} {shapes} {badge} {rev} dark />
  </div>

  <div class="panel">
    <p class="where" aria-live="off">
      {#key name.name}<span class="t-name nm">{name.name.includes(': ') ? name.name.split(': ').slice(1).join(': ') : name.name}{#if name.eco}<span class="eco">{name.eco}</span>{/if}</span>{/key}
      <span class="fam">{name.name.includes(': ') ? name.name.split(': ')[0] + ' · ' : ''}the {demo.band} band · you play White</span>
    </p>

    <div class="flip" class:on={learned && show !== 'hint'}>
      <div class="face front">
        <span class="tag new"><Plies stage="new" size={16} /> New move</span>
        <b class="mv">{num(cardIdx)}{card.san}</b>
        <span class="why">{card.why}</span>
      </div>
      <div class="face back" aria-hidden={!(learned && show !== 'hint')}>
        <span class="tag lrn"><Plies stage="learning" size={16} /> Learned</span>
        <b class="mv">{num(cardIdx)}{card.san} <i class="ok">!</i></b>
        <span class="why">Its first layer is down. It comes back just before you would forget it.</span>
      </div>
    </div>

    <div class="fan" class:live={show === 'fan'}>
      <p class="fh">What Black plays after {num(fanFor - 1)}{H[fanFor - 1].san} <span>{n(H[fanFor].reached)} games</span></p>
      {#each fanNow as f, k (f.uci)}
        <div class="fr" class:top={k === 0}>
          <b>{f.san}</b>
          <span class="bar"><i style="transform:scaleX({f.pct / 100})"></i></span>
          <span class="pc t-num">{Math.round(f.pct)}%</span>
        </div>
      {/each}
    </div>

    <div class="ctl">
      <button onclick={() => manual(-1)} disabled={i === 0} aria-label="Step back"><Icon name="back" size={18} /></button>
      <button class="pp" onclick={() => (playing = !playing)} aria-pressed={playing} aria-label={playing ? 'Pause the demonstration' : 'Play the demonstration'}>
        {#if playing}<span class="pause" aria-hidden="true"></span>{:else}<Icon name="play" size={16} fill />{/if}
      </button>
      <button onclick={() => manual(1)} aria-label="Next move"><Icon name="next" size={18} /></button>
      <span class="line">{#each H.slice(0, i) as p, k}<span class:me={p.mine}>{#if k % 2 === 0}<em>{k / 2 + 1}.</em>{/if}{p.san}</span>{/each}{#if !i}<span class="ghost">1.</span>{/if}</span>
    </div>
  </div>
</div>

<style>
  .demo { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; width: 100%; }
  .stage { width: 100%; max-width: 560px; margin: 0 auto; pointer-events: none; }
  .panel { display: flex; flex-direction: column; gap: 12px; min-width: 0; color: var(--night-ink); }
  .where { display: flex; flex-direction: column; gap: 2px; min-height: 58px; }
  .nm { font-size: 24px; line-height: 1.1; animation: rise 320ms var(--ease) both; }
  .nm .eco { background: rgba(255, 255, 255, 0.12); }
  .fam { font-size: 13px; color: var(--night-ink-2); }

  /* the card: two faces of one veneer */
  .flip { position: relative; height: 132px; perspective: 900px; }
  .face { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 20px; backface-visibility: hidden; transition: transform 560ms var(--spring); }
  .front { background: var(--night-2); box-shadow: inset 0 0 0 1.5px var(--night-3); }
  .back { background: var(--birch); color: var(--ink-fixed); transform: rotateX(-180deg); box-shadow: 0 5px 0 var(--birch-3); }
  .flip.on .front { transform: rotateX(180deg); }
  .flip.on .back { transform: none; }
  .tag { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; letter-spacing: 0.01em; color: var(--night-ink-2); }
  .tag.lrn { color: var(--walnut); }
  .mv { font-size: 30px; line-height: 1; font-weight: 750; letter-spacing: -0.03em; }
  .ok { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--good); color: #fff; font-style: normal; font-size: 14px; font-weight: 800; vertical-align: 5px; margin-left: 4px; }
  .why { font-family: var(--serif); font-style: italic; font-size: 15px; line-height: 1.25; color: var(--night-ink-2); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .back .why { color: var(--walnut); }

  .fan { padding: 12px 16px 10px; border-radius: 20px; background: var(--night-2); transition: opacity 300ms; opacity: 0.62; }
  .fan.live { opacity: 1; }
  .fh { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; font-weight: 650; color: var(--night-ink-2); margin-bottom: 6px; }
  .fh span { font-weight: 500; white-space: nowrap; }
  .fr { display: grid; grid-template-columns: 52px 1fr 40px; align-items: center; gap: 10px; height: 26px; font-size: 15px; }
  .fr b { font-weight: 700; }
  .bar { height: 8px; border-radius: 4px; background: var(--night-3); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 4px; background: #8088b3; transform-origin: left; transition: transform 500ms var(--ease); }
  .fr.top .bar i { background: #7f9bff; }
  .pc { text-align: right; font-size: 14px; color: var(--night-ink-2); }
  .fr.top .pc { color: var(--night-ink); font-weight: 700; }

  .ctl { display: flex; align-items: center; gap: 6px; }
  .ctl button { flex: none; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 14px; background: var(--night-2); color: var(--night-ink); transition: background 160ms; }
  .ctl button:hover { background: var(--night-3); }
  .ctl button:disabled { opacity: 0.4; }
  .ctl .pp { background: var(--birch); color: var(--ink-fixed); }
  .ctl .pp:hover { background: #fff0d2; }
  .pause { width: 12px; height: 14px; border-left: 4px solid currentColor; border-right: 4px solid currentColor; }
  .line { flex: 1; min-width: 0; display: flex; gap: 2px; overflow: hidden; justify-content: flex-end; margin-left: 6px; font-size: 14px; font-weight: 600; color: var(--night-ink-2); white-space: nowrap; }
  .line span { padding: 3px 5px; border-radius: 7px; }
  .line span:last-child { background: var(--night-3); color: var(--night-ink); }
  .line em { font-style: normal; opacity: 0.6; margin-right: 2px; font-weight: 500; }
  .line .ghost { opacity: 0.4; }

  @media (min-width: 900px) {
    .demo { grid-template-columns: minmax(0, 1fr) 290px; align-items: center; gap: 26px; justify-content: end; }
    .stage { max-width: min(100%, calc(100vh - 200px)); margin: 0 0 0 auto; }
  }
</style>
