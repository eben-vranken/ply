<script lang="ts">
  import { app, save, resetAll } from '../lib/state.svelte';
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
      { k: 'depth', label: 'Line depth', hint: 'Your moves per line', min: 3, max: 20, step: 1, fmt: (v) => (v < 4 ? 'Auto' : `${v}`) },
      { k: 'replyPct', label: 'Opponent reply threshold', min: 1, max: 10, step: 1, fmt: (v) => `${v}%` },
      { k: 'band', label: 'Rating band', hint: 'Auto is chess.com rapid + 350', min: 800, max: 2000, step: 200, fmt: (v) => (v < 1000 ? 'Auto' : `${v}`) }
    ]],
    ['Board and appearance', [{ k: 'delay', label: 'Opponent move delay', min: 0, max: 1500, step: 100, fmt: (v) => `${v} ms` }]]
  ];
  function bump(n: Num, d: number) {
    app[n.k] = Math.min(n.max, Math.max(n.min, app[n.k] + d * n.step));
    if (n.k === 'depth' && app.depth < 4) app.depth = d > 0 ? 4 : 3;
    save(); buzz(8);
  }
  const toggles: ['sounds' | 'vibration' | 'showName', string, string?][] = [
    ['sounds', 'Sounds'], ['vibration', 'Vibration'], ['showName', 'Show opening name while answering', 'Branch labels always show']
  ];
  const classes = ['Rapid', 'Blitz', 'Daily'];
  function flip(c: string) { app.timeClasses = app.timeClasses.includes(c) ? app.timeClasses.filter((x) => x !== c) : [...app.timeClasses, c]; save(); }

  let status = $state('');
  let confirm = $state('');
  let asking = $state(false);
  const say = (s: string) => { status = s; setTimeout(() => (status = ''), 3200); };
  function sync() { say(app.username ? 'Sync needs the game analyser, which is not in this build yet.' : 'Add your chess.com username first.'); }
  async function exportBackup() {
    const name = `ply-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify({ app: 'ply', schemaVersion: 0, exportedAt: new Date().toISOString(), tables: { settings: app } }, null, 2)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
      app.lastBackup = Date.now(); save(); say('Backup exported.');
    } catch { /* share sheet dismissed */ }
  }
  async function importBackup(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try { const j = JSON.parse(await f.text()); Object.assign(app, j.tables.settings); save(); say('Backup imported.'); } catch { say("That file isn't a Ply backup."); }
  }
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
    <div class="r"><button class="btn quiet wide" onclick={sync}><Icon name="wifi" size={20} /> Sync now</button></div>
  </section>

  <div class="sect"><h2 class="t-head">Your data</h2></div>
  <section class="card rows">
    <div class="r two">
      <button class="btn grow" onclick={exportBackup}><Icon name="share" size={20} /> Export backup</button>
      <label class="btn quiet grow">Import backup<input type="file" accept="application/json" hidden onchange={importBackup} /></label>
    </div>
    {#if !asking}
      <div class="r"><button class="link danger" onclick={() => (asking = true)}>Reset all progress</button></div>
    {:else}
      <div class="r col">
        <p class="t-small">This deletes every card, review and setting on this phone. Type RESET to confirm.</p>
        <div class="row">
          <input class="txt grow" style="text-align:left" placeholder="RESET" bind:value={confirm} autocapitalize="characters" />
          <button class="btn sm bad" disabled={confirm !== 'RESET'} onclick={() => { resetAll(); }}>Reset</button>
        </div>
      </div>
    {/if}
  </section>
  {#if status}<p class="status" role="status">{status}</p>{/if}
  <p class="foot">Ply 1.0 design build · demo data · GPL-3.0</p>
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
  .foot { text-align: center; font-size: 12.5px; color: var(--ink-3); margin-top: 26px; }
</style>
