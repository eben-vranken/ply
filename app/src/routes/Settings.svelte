<script lang="ts">
  import { app, save, DEFAULTS, resetSettings } from '../lib/state.svelte';
  import { model, regenerate, switchBand, currentBand, depthLimit, reloadFromDb, resetAllProgress } from '../lib/model.svelte';
  import { db } from '../lib/db';
  import { makeBackup, parseBackup, restoreBackup, shareBackup, type Backup } from '../lib/backup';
  import { sync, syncNow, importPgn } from '../lib/import/sync.svelte';
  import { sfx, buzz } from '../lib/fx';
  import Icon from '../lib/Icon.svelte';

  type Num = { k: 'newMoves' | 'newTraps' | 'newMistakes' | 'maxReviews' | 'hardSeconds' | 'retention' | 'depth' | 'replyPct' | 'band' | 'rollover' | 'delay'; label: string; hint?: string; min: number; max: number; step: number; fmt: (v: number) => string };
  const groups: [string, Num[]][] = [
    ['Daily limits', [
      { k: 'newMoves', label: 'New moves', min: 0, max: 50, step: 1, fmt: (v) => `${v}` },
      { k: 'newTraps', label: 'New traps', hint: 'Punish, Danger, Puzzle', min: 0, max: 30, step: 1, fmt: (v) => `${v}` },
      { k: 'newMistakes', label: 'New mistake cards', min: 0, max: 30, step: 1, fmt: (v) => `${v}` },
      { k: 'maxReviews', label: 'Maximum reviews', hint: 'All card types', min: 20, max: 999, step: 10, fmt: (v) => `${v}` }
    ]],
    ['Scheduling', [
      { k: 'hardSeconds', label: 'Hard threshold', hint: 'Slower than this per move counts as Hard', min: 3, max: 30, step: 1, fmt: (v) => `${v} s` },
      { k: 'retention', label: 'Desired retention', min: 80, max: 97, step: 1, fmt: (v) => `0.${v}` },
      { k: 'rollover', label: 'Day rollover', min: 0, max: 6, step: 1, fmt: (v) => `0${v}:00` }
    ]],
    ['Lines', [
      { k: 'depth', label: 'Line depth', hint: 'Your moves per line', min: 3, max: 20, step: 1, fmt: (v) => (v < 4 ? `Auto · ${depthLimit()}` : `${v}`) },
      { k: 'replyPct', label: 'Opponent reply threshold', min: 1, max: 10, step: 1, fmt: (v) => `${v}%` },
      { k: 'band', label: 'Rating band', hint: 'Auto is chess.com rapid + 350. A set band is locked', min: 800, max: 2000, step: 200, fmt: (v) => (v < 1000 ? `Auto · ${app.autoBand}` : `${v}`) }
    ]],
    ['Board and appearance', [{ k: 'delay', label: 'Opponent move delay', min: 0, max: 1500, step: 100, fmt: (v) => `${v} ms` }]]
  ];
  let regenTimer: ReturnType<typeof setTimeout> | undefined;
  function bump(n: Num, d: number) {
    app[n.k] = Math.min(n.max, Math.max(n.min, app[n.k] + d * n.step));
    if (n.k === 'depth' && app.depth < 4) app.depth = d > 0 ? 4 : 3;
    if (n.k === 'band' && app.band < 1000) app.band = d > 0 ? 1000 : 800;
    save(); buzz(8);
    // limits rebuild today's queue at once; line settings regenerate the lines
    if (n.k === 'depth' || n.k === 'replyPct') { clearTimeout(regenTimer); regenTimer = setTimeout(regenerate, 350); }
    else if (n.k === 'band') { clearTimeout(regenTimer); regenTimer = setTimeout(() => void switchBand(currentBand()).catch((e: Error) => say(e.message)), 600); }
    else model.rev++;
  }
  const toggles: ['sounds' | 'vibration' | 'showName', string, string?][] = [
    ['sounds', 'Sounds'], ['vibration', 'Vibration'], ['showName', 'Show opening name while answering', 'Branch labels always show']
  ];
  const classes = ['Rapid', 'Blitz', 'Daily'];
  function flip(c: string) { app.timeClasses = app.timeClasses.includes(c) ? app.timeClasses.filter((x) => x !== c) : [...app.timeClasses, c]; save(); }

  let status = $state('');
  let confirm = $state('');
  let asking = $state(false);
  let pending = $state<Backup | null>(null);
  let pasting = $state(false);
  let pgn = $state('');
  let pasteSide = $state<'auto' | 'w' | 'b'>('auto');
  const say = (s: string) => { status = s; setTimeout(() => (status = ''), 3600); };
  function syncClick() { if (!app.username) return say('Add your chess.com username first.'); void syncNow(); }
  async function exportBackup() {
    if (await shareBackup(await makeBackup())) { app.lastBackup = Date.now(); save(); say('Backup exported.'); }
  }
  async function pickBackup(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try { pending = parseBackup(await f.text()); } catch (err) { say((err as Error).message); }
  }
  async function importBackup() {
    if (!pending) return;
    await restoreBackup(pending);
    pending = null;
    const s = (await db.settings.get('app'))?.value;
    if (s) Object.assign(app, DEFAULTS, s);
    save();
    await reloadFromDb();
    say('Backup imported. Lines regenerated.');
  }
  async function paste() {
    try { const n = await importPgn(pgn, pasteSide); say(n ? `${n} game${n === 1 ? '' : 's'} imported. Analysing.` : 'No new games in that text.'); pgn = ''; pasting = false; }
    catch (e) { say((e as Error).message); }
  }
  async function resetEverything() {
    await resetAllProgress();
    resetSettings();
    location.reload();
  }
  const summary = $derived(sync.summary);
</script>


<div class="screen">
  <header class="screen-head"><h1 class="t-display">Settings</h1></header>

  {#each groups as [title, rows]}
    <div class="sect"><h2 class="t-head">{title}</h2></div>
    <section class="card rows">
      {#each rows as n}
        <div class="r">
          <div class="grow"><p class="lb">{n.label}</p>{#if n.hint}<p class="t-small">{n.hint}</p>{/if}</div>
          <div class="stepper">
            <button onclick={() => bump(n, -1)} aria-label="Less {n.label}">−</button>
            <output class="t-num">{n.fmt(app[n.k])}</output>
            <button onclick={() => bump(n, 1)} aria-label="More {n.label}">+</button>
          </div>
        </div>
      {/each}
      {#if title === 'Board and appearance'}
        <div class="r">
          <p class="lb grow">Appearance</p>
          <div class="pick">{#each ['auto', 'light', 'dark'] as const as t}<button class:on={app.theme === t} aria-pressed={app.theme === t} onclick={() => { app.theme = t; save(); }}>{t === 'auto' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}</button>{/each}</div>
        </div>
        {#each toggles as [k, label, hint]}
          <label class="r">
            <div class="grow"><p class="lb">{label}</p>{#if hint}<p class="t-small">{hint}</p>{/if}</div>
            <input type="checkbox" role="switch" bind:checked={app[k]} onchange={() => { save(); if (k === 'sounds') sfx.good(); }} />
          </label>
        {/each}
      {/if}
    </section>
  {/each}

  <div class="sect"><h2 class="t-head">chess.com</h2></div>
  <section class="card rows">
    <label class="r"><p class="lb grow">Username</p><input class="txt" placeholder="not set" bind:value={app.username} onchange={save} autocapitalize="off" autocomplete="off" spellcheck="false" /></label>
    <div class="r">
      <p class="lb grow">Time classes</p>
      <div class="pick">{#each classes as c}<button class:on={app.timeClasses.includes(c)} aria-pressed={app.timeClasses.includes(c)} onclick={() => flip(c)}>{c}</button>{/each}</div>
    </div>
    <div class="r col">
      <button class="btn quiet wide" onclick={syncClick} disabled={sync.running}><Icon name="wifi" size={20} /> {sync.running ? 'Syncing…' : 'Sync now'}</button>
      {#if sync.text}<p class="t-small">{sync.text}</p>{/if}
      {#if sync.analysing && sync.total}<div class="meter"><i style="width:{(sync.done / sync.total) * 100}%"></i></div>{/if}
      {#if summary}
        <p class="t-small">{summary.imported} new game{summary.imported === 1 ? '' : 's'} · {summary.mistakes} mistake card{summary.mistakes === 1 ? '' : 's'} · {summary.uncovered} uncovered repl{summary.uncovered === 1 ? 'y' : 'ies'}</p>
        {#if summary.lapsed.length}<p class="t-small">You left your repertoire here, so these cards are due again:</p><ul class="lapsed">{#each summary.lapsed as l}<li>{l}</li>{/each}</ul>{/if}
      {/if}
      {#if sync.error}
        <p class="err">{sync.error}</p>
        {#if !pasting}<button class="link" onclick={() => (pasting = true)}>Paste PGN instead</button>{/if}
      {:else if !pasting}
        <button class="link" onclick={() => (pasting = true)}>Paste PGN</button>
      {/if}
      {#if pasting}
        <textarea class="pgn" rows="5" bind:value={pgn} placeholder="Paste one or many games in PGN"></textarea>
        <div class="pick">
          <button class:on={pasteSide === 'auto'} onclick={() => (pasteSide = 'auto')}>Detect</button>
          <button class:on={pasteSide === 'w'} onclick={() => (pasteSide = 'w')}>I was White</button>
          <button class:on={pasteSide === 'b'} onclick={() => (pasteSide = 'b')}>I was Black</button>
        </div>
        <button class="btn wide" onclick={paste} disabled={!pgn.trim()}>Import games</button>
      {/if}
    </div>
  </section>


  <div class="sect"><h2 class="t-head">Your data</h2></div>
  <section class="card rows">
    <div class="r two">
      <button class="btn grow" onclick={exportBackup}><Icon name="share" size={20} /> Export backup</button>
      <label class="btn quiet grow">Import backup<input type="file" accept="application/json,.json" hidden onchange={pickBackup} /></label>
    </div>
    {#if pending}
      <div class="r col">
        <p class="t-small">Replace everything on this phone with the backup from {pending.exportedAt.slice(0, 10)}? It holds {pending.tables.cards.length} cards and {pending.tables.reviews.length} reviews.</p>
        <div class="row" style="gap:8px"><button class="btn quiet sm grow" onclick={() => (pending = null)}>Cancel</button><button class="btn sm grow" onclick={importBackup}>Replace and import</button></div>
      </div>
    {/if}
    {#if !asking}
      <div class="r"><button class="link danger" onclick={() => (asking = true)}>Reset all progress</button></div>
    {:else}
      <div class="r col">
        <p class="t-small">This deletes every card, review and setting on this phone. Type RESET to confirm.</p>
        <div class="row">
          <input class="txt grow" style="text-align:left" placeholder="RESET" bind:value={confirm} autocapitalize="characters" />
          <button class="btn sm bad" disabled={confirm !== 'RESET'} onclick={resetEverything}>Reset</button>
        </div>
      </div>
    {/if}
  </section>
  {#if status}<p class="status" role="status">{status}</p>{/if}
  <p class="foot">Ply 1.0 · opening data {model.version || '—'} · {model.band} band · GPL-3.0<br />Opening data from the Lichess open database (CC0)</p>
</div>

<style>
  .rows { padding: 4px 16px; }
  .r { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 8px 0; }
  .r + .r { border-top: 1px solid var(--ground); }
  .r.col { flex-direction: column; align-items: stretch; padding: 14px 0; }
  .r.two { padding: 14px 0 16px; }
  .lb { font-weight: 600; }
  .stepper { display: flex; align-items: center; background: var(--ground); border-radius: 14px; padding: 3px; }
  .stepper button { width: 44px; height: 44px; border-radius: 11px; background: var(--card); font-size: 22px; font-weight: 600; box-shadow: 0 2px 0 var(--line); }
  .stepper button:active { transform: translateY(2px); box-shadow: none; }
  .stepper output { min-width: 62px; text-align: center; font-size: 16px; }
  input[role='switch'] { appearance: none; width: 54px; height: 32px; border-radius: 16px; background: var(--st-new); position: relative; transition: background 160ms; flex: none; margin: 6px 0; }
  input[role='switch']::after { content: ''; position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgba(21, 25, 54, 0.3); transition: transform 220ms var(--spring); }
  input[role='switch']:checked { background: var(--cobalt); }
  input[role='switch']:checked::after { transform: translateX(22px); }
  .txt { height: 44px; border-radius: 12px; border: 0; background: var(--ground); padding: 0 14px; text-align: right; width: 170px; user-select: text; font-weight: 600; }
  .pick { display: flex; gap: 6px; }
  .pick button { height: 44px; padding: 0 13px; border-radius: 12px; background: var(--ground); font-weight: 650; font-size: 14px; color: var(--ink-2); }
  .pick button.on { background: var(--ink); color: var(--on-ink); }
  .link.danger { color: var(--bad-text); }
  .btn.sm { min-height: 44px; }
  .btn.bad { --face: var(--bad); --edge: #8f1f0e; }
  .status { margin-top: 14px; padding: 12px 14px; border-radius: 14px; background: var(--ink); color: var(--on-ink); font-size: 14px; animation: rise 200ms var(--ease) both; }
  .meter { height: 8px; border-radius: 4px; background: var(--ground); overflow: hidden; }
  .meter i { display: block; height: 100%; background: var(--good); }
  .err { color: var(--bad-text); font-weight: 600; font-size: 14px; }
  .lapsed { margin: 0; padding-left: 18px; font-size: 13px; color: var(--ink-2); }
  .pgn { width: 100%; border: 0; border-radius: 14px; background: var(--ground); padding: 12px; font: 13px/1.4 ui-monospace, monospace; color: var(--ink); user-select: text; resize: vertical; }
  .r.col { gap: 10px; }
  .foot { text-align: center; font-size: 12.5px; color: var(--ink-3); margin-top: 26px; }
</style>
