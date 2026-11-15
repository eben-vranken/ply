<script lang="ts">
  // Play it out: from the end of a line you keep playing against an opponent. While the
  // position is still in the book it answers the way people at your level do; after that
  // Stockfish takes over. Every move of yours is checked against the engine's best, and
  // nothing here touches a card.
  import { onMount } from 'svelte';
  import { Chess } from 'chess.js';
  import { route, go } from '../lib/state.svelte';
  import { data, nameOf } from '../lib/model.svelte';
  import { epdAfter, epdOf, fenOf, dests as destsOf, moveOrder, sans, type Side } from '../lib/chess';
  import { Engine } from '../lib/engine/stockfish';
  import { sfx, buzz } from '../lib/fx';
  import { addXp } from '../lib/game';
  import { verdict } from '../lib/voice';
  import Board, { type Badge } from '../lib/Board.svelte';
  import Mascot from '../lib/Mascot.svelte';
  import Icon from '../lib/Icon.svelte';

  const q = new URLSearchParams(route.path.split('?')[1] ?? '');
  const side = ((q.get('side') as Side) ?? 'w');
  const path = q.get('p')?.split(' ').filter(Boolean) ?? [];
  const name = nameOf(epdAfter(path), path)[1];
  const GOAL = 8; // your moves per play-out
  const THINK = 280;

  let chess = new Chess(fenOf(epdAfter(path)));
  let fen = $state(chess.fen());
  let lastMove = $state<[string, string] | null>(path.length ? [path.at(-1)!.slice(0, 2), path.at(-1)!.slice(2, 4)] : null);
  let dests = $state<Map<string, string[]> | null>(null);
  let badge = $state<Badge | null>(null);
  let check = $state(false);
  let rev = $state(0), shake = $state(0);
  let msg = $state<{ tone: 'good' | 'bad' | 'warn' | 'info'; text: string }>({ tone: 'info', text: 'Getting the board ready…' });
  let mine = $state(0); // your moves so far
  let cp = $state(0); // eval from your side
  let worst = $state(0);
  let slips = $state(0);
  let over = $state<{ cp: number; xp: number } | null>(null);
  let hist = $state<string[]>([]);
  let engine: Engine | undefined;
  let best: { cp: number; san: string } | null = null; // the engine's choice in the position you are about to move in
  let alive = true;

  const toMove = (u: string) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  function sync(mv?: { from: string; to: string }) { fen = chess.fen(); check = chess.inCheck(); if (mv) lastMove = [mv.from, mv.to]; hist = chess.history(); }
  const pawns = (x: number) => (Math.abs(x) / 100).toFixed(1);

  /** your turn: find the engine's best first, so your move can be measured against it */
  async function yourTurn() {
    if (chess.isGameOver() || mine >= GOAL) return finish();
    const [l] = await engine!.analyse(chess.fen(), THINK);
    if (!alive) return;
    if (l?.pv[0]) { const m = chess.move(toMove(l.pv[0])); chess.undo(); best = { cp: l.cp, san: m.san }; cp = l.cp; } else best = null;
    dests = destsOf(chess);
    if (!mine) msg = { tone: 'info', text: `The book line ends here. Play your next ${GOAL} moves.` };
  }

  async function onmove(from: string, to: string) {
    const p = chess.get(from as never);
    const mv = chess.move({ from, to, promotion: p?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined });
    mv.captured ? sfx.capture() : sfx.move();
    dests = null; mine++; sync(mv);
    if (chess.isCheckmate()) { badge = { square: mv.to, glyph: '#', tone: 'good' }; cp = 10000; return finish(); }
    // the position after your move, from the opponent's side: the same search gives their reply
    const [l] = await engine!.analyse(chess.fen(), THINK);
    if (!alive) return;
    const now = l ? -l.cp : cp;
    const loss = best ? Math.max(0, best.cp - now) : 0;
    cp = now; worst = Math.max(worst, loss);
    if (loss >= 150) { slips++; badge = { square: mv.to, glyph: '?', tone: 'bad' }; shake++; sfx.bad(); buzz(40); msg = { tone: 'bad', text: `That gives up about ${pawns(loss)} pawns. The engine wanted ${best!.san}.` }; }
    else if (loss >= 60) { badge = { square: mv.to, glyph: '?!', tone: 'warn' }; msg = { tone: 'warn', text: `Playable. ${best!.san} was a little stronger.` }; }
    else { badge = { square: mv.to, glyph: '!', tone: 'good' }; sfx.good(); msg = { tone: 'good', text: best && mv.san === best.san ? 'The engine’s first choice.' : 'A good move.' }; }
    if (chess.isGameOver() || mine >= GOAL) return setTimeout(finish, 900);
    setTimeout(() => void reply(l?.pv[0]), 650);
  }

  /** the opponent: a book move drawn by how often it is played at your level, else the engine's move */
  async function reply(engineMove?: string) {
    if (!alive) return;
    const n = data()?.tree[epdOf(chess)];
    const book = (n?.m ?? []).filter(([, g]) => g >= 50);
    let u = engineMove;
    if (book.length) { let r = Math.random() * book.reduce((s, m) => s + m[1], 0); for (const m of book) { r -= m[1]; if (r <= 0) { u = m[0]; break; } } }
    if (!u) return finish();
    const mv = chess.move(toMove(u));
    mv.captured ? sfx.capture() : sfx.move();
    badge = null; sync(mv);
    await yourTurn();
  }

  function finish() {
    if (over) return;
    dests = null;
    const xp = cp > -60 && slips === 0 ? 20 : cp > -200 ? 10 : 5;
    addXp(xp);
    over = { cp, xp };
    cp > -60 ? sfx.done() : sfx.tick();
  }
  function begin() {
    if (chess.turn() === side) void yourTurn(); else void (async () => { const [l] = await engine!.analyse(chess.fen(), THINK); await reply(l?.pv[0]); })();
  }
  function again() {
    chess = new Chess(fenOf(epdAfter(path)));
    mine = 0; cp = 0; worst = 0; slips = 0; over = null; badge = null; best = null;
    lastMove = path.length ? [path.at(-1)!.slice(0, 2), path.at(-1)!.slice(2, 4)] : null;
    msg = { tone: 'info', text: 'Same position, fresh game.' };
    sync(); begin();
  }
  function leave() { if (history.length > 1) history.back(); else go('/today'); }

  onMount(() => {
    engine = new Engine();
    begin();
    return () => { alive = false; engine?.quit(); };
  });

  const say = $derived(over ? verdict(over.cp, worst) : null);
  // the bar: your share of the board, ±3 pawns end to end
  const bar = $derived(50 + Math.max(-50, Math.min(50, (cp / 300) * 50)));
  const evalText = $derived(Math.abs(cp) > 9000 ? 'mate' : (cp >= 0 ? '+' : '−') + pawns(cp));
</script>

<div class="room">
  <header>
    <button class="x" onclick={leave} aria-label="Leave"><Icon name="close" /></button>
    <div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax={GOAL} aria-valuenow={mine}><i style="width:{Math.max(4, (mine / GOAL) * 100)}%"></i></div>
    <span class="mode">{Math.min(mine + 1, GOAL)}/{GOAL}</span>
  </header>
  <div class="label">
    <p class="t-name nm">{name}</p>
    <p class="ord">Play it out · {path.length ? moveOrder(sans(path)) : 'from the start'}</p>
  </div>
  <div class="boardwrap">
    <Board {fen} {side} {dests} {lastMove} {badge} {check} {rev} {shake} dark {onmove} />
  </div>
  <div class="ev" role="img" aria-label="Evaluation {evalText} for you">
    <span class="track"><i style="width:{bar}%"></i></span><b class="t-num">{evalText}</b>
  </div>

  {#if over && say}
    <div class="end">
      <Mascot mood={say.mood} size={64} />
      <div class="grow">
        <p class="gt">{over.cp >= 40 ? 'Better out of the opening' : over.cp > -60 ? 'Level' : 'Worse this time'} <span class="xp t-num">+{over.xp} XP</span></p>
        <p class="sub">{say.text}</p>
      </div>
    </div>
    <footer>
      <button class="btn night" onclick={again}><Icon name="undo" size={20} /> Again</button>
      <button class="btn sun grow" onclick={leave}>Done</button>
    </footer>
  {:else}
    {#key msg.text}
      <p class="msg {msg.tone}"><span class="g">{msg.tone === 'good' ? '!' : msg.tone === 'bad' ? '?' : msg.tone === 'warn' ? '?!' : 'i'}</span>{msg.text}</p>
    {/key}
    <div class="strip">
      {#each hist.slice(-8) as m, i}<span class:last={i === Math.min(hist.length, 8) - 1}>{m}</span>{/each}
    </div>
    <footer><p class="src">The opponent plays what your level plays, then Stockfish. Cards are not touched.</p></footer>
  {/if}
</div>

<style>
  .room { position: absolute; inset: 0; background: var(--night); color: var(--night-ink); display: flex; flex-direction: column; padding: calc(env(safe-area-inset-top) + 6px) 0 calc(env(safe-area-inset-bottom) + 16px); }
  header { display: flex; align-items: center; gap: 10px; padding: 0 12px 0 4px; height: 48px; flex: none; }
  .x { width: 44px; height: 44px; display: grid; place-items: center; color: var(--night-ink-2); }
  .prog { flex: 1; height: 14px; border-radius: 7px; background: var(--night-3); overflow: hidden; }
  .prog i { display: block; height: 100%; border-radius: 7px; background: linear-gradient(var(--birch) 0 45%, var(--birch-2) 45% 100%); box-shadow: inset 0 -3px 0 var(--birch-3); transition: width 420ms var(--spring); }
  .mode { font-size: 13px; font-weight: 650; color: var(--night-ink-2); min-width: 34px; text-align: right; }
  .label { height: 58px; flex: none; padding: 4px 16px 0; display: flex; flex-direction: column; justify-content: center; }
  .nm { font-size: 21px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ord { font-size: 13px; color: var(--night-ink-2); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .boardwrap { padding: 0 8px; flex: none; }
  .ev { display: flex; align-items: center; gap: 10px; padding: 12px 16px 0; }
  .track { flex: 1; height: 10px; border-radius: 5px; background: #0b0e24; overflow: hidden; box-shadow: inset 0 0 0 1px var(--night-3); }
  .track i { display: block; height: 100%; background: var(--birch); border-radius: 5px; transition: width 500ms var(--ease); }
  .ev b { font-size: 15px; min-width: 44px; text-align: right; }
  .msg { display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px 0; font-size: 17px; font-weight: 600; line-height: 1.25; animation: rise 200ms var(--ease) both; }
  .g { flex: none; min-width: 28px; height: 28px; padding: 0 5px; display: grid; place-items: center; border-radius: 9px; font-weight: 800; font-size: 15px; margin-top: -3px; background: var(--night-3); }
  .msg.good .g { background: var(--good); color: #fff; border-radius: 50%; }
  .msg.bad .g { background: var(--bad); color: #fff; }
  .msg.warn .g { background: var(--sun); color: #3d2800; }
  .msg.good { color: #8fe3bd; } .msg.bad { color: #ffb4a6; } .msg.warn { color: #ffd98a; }
  .strip { display: flex; gap: 4px; padding: 10px 16px; min-height: 46px; overflow: hidden; }
  .strip span { white-space: nowrap; font-size: 15px; font-weight: 600; color: var(--night-ink-2); padding: 4px 7px; border-radius: 8px; }
  .strip .last { background: var(--night-3); color: var(--night-ink); }
  footer { margin-top: auto; display: flex; align-items: center; gap: 12px; padding: 8px 16px 6px; }
  .src { font-size: 13px; color: var(--night-ink-2); }
  .end { display: flex; align-items: center; gap: 14px; margin: 14px 8px 0; padding: 14px; border-radius: 22px; background: var(--night-2); animation: rise 280ms var(--ease) both; }
  .gt { font-size: 20px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.15; }
  .xp { display: inline-block; margin-left: 6px; font-size: 13.5px; color: var(--sun); vertical-align: 2px; }
  .sub { font-size: 14.5px; line-height: 1.35; color: var(--night-ink-2); margin-top: 5px; }
</style>
