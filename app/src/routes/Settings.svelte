<script lang="ts">
  import { app, save, DEFAULTS, resetSettings, go } from '../lib/state.svelte';
  import { summaries, isFocus, toggleFocus } from '../lib/model.svelte';
  import { GOALS } from '../lib/game';
  import { model, regenerate, switchBand, currentBand, depthLimit, reloadFromDb, resetAllProgress, bandList } from '../lib/model.svelte';
  import { db } from '../lib/db';
  import { makeBackup, parseBackup, restoreBackup, shareBackup, type Backup } from '../lib/backup';
  import { sync, syncNow, importPgn, filtersChanged } from '../lib/import/sync.svelte';
  import { TIME_CLASSES } from '../lib/import/filters';
  import { sfx, buzz } from '../lib/fx';
  import Icon from '../lib/Icon.svelte';
  import { canVibrate } from '../lib/platform';
  import { fitMySchedule, useDefaultWeights, MIN_REVIEWS } from '../lib/srs/personal';
  import { configured, cloud, requestSync, syncLabel, logOut, deleteAccount, resetAccount, setPassword } from '../lib/cloud/cloud.svelte';

  type Num = { k: 'newMoves' | 'newTraps' | 'maxReviews' | 'hardSeconds' | 'retention' | 'depth' | 'replyPct' | 'band' | 'rollover' | 'delay'; label: string; hint?: string; min: number; max: number; step: number; fmt: (v: number) => string };
  const groups: [string, Num[]][] = [
    ['Daily limits', [
      { k: 'newMoves', label: 'New moves', min: 0, max: 50, step: 1, fmt: (v) => `${v}` },
      { k: 'newTraps', label: 'New traps', hint: 'Punish, Danger', min: 0, max: 30, step: 1, fmt: (v) => `${v}` },
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
      { k: 'band', label: 'Rating band', hint: 'Auto is chess.com rapid + 350. A set band is locked', min: 800, max: 3000, step: 200, fmt: (v) => (v < 1000 ? `Auto · ${app.autoBand}` : `${v}`) }
    ]],
    ['Board and appearance', [{ k: 'delay', label: 'Opponent move delay', min: 0, max: 1500, step: 100, fmt: (v) => `${v} ms` }]]
  ];
  let regenTimer: ReturnType<typeof setTimeout> | undefined;
  function bump(n: Num, d: number) {
    app[n.k] = Math.min(n.max, Math.max(n.min, app[n.k] + d * n.step));
    if (n.k === 'depth' && app.depth < 4) app.depth = d > 0 ? 4 : 3;
    if (n.k === 'band' && app.band < 1000) app.band = d > 0 ? 1000 : 800;
    // only the bands the opening data has
    if (n.k === 'band' && app.band >= 1000) app.band = Math.min(app.band, Math.max(...bandList()));
    save(); buzz(8);
    // limits rebuild today's queue at once; line settings regenerate the lines
    if (n.k === 'depth' || n.k === 'replyPct') { clearTimeout(regenTimer); regenTimer = setTimeout(regenerate, 350); }
    else if (n.k === 'band') { clearTimeout(regenTimer); regenTimer = setTimeout(() => void switchBand(currentBand()).catch((e: Error) => say(e.message)), 600); }
    else model.rev++;
  }
  // the openings you can master: the biggest of each colour, and whatever is mastered already
  const ops = $derived.by(() => { void model.rev; const all = summaries().filter((o) => o.path.length); const on = (o: (typeof all)[number]) => (isFocus(o.side, o.path) ? 0 : 1); return all.filter((o, i) => i < 12 || !on(o)).sort((a, b) => on(a) - on(b) || a.side.localeCompare(b.side) * -1 || b.total - a.total); });
  type Toggle = ['sounds' | 'vibration' | 'showName' | 'autoNext', string, string?];
  // iPhones have no vibration for web pages, so the switch only shows where it does something
  const toggles = ([
    ['autoNext', 'Move on after a clean answer', 'A wrong answer always waits for you'], ['sounds', 'Sounds'], ['vibration', 'Vibration'], ['showName', 'Show opening name while answering', 'Where you have two moves, Birch still says which']
  ] as Toggle[]).filter(([k]) => k !== 'vibration' || canVibrate());
  function flip(c: string) {
    const next = app.timeClasses.includes(c) ? app.timeClasses.filter((x) => x !== c) : [...app.timeClasses, c];
    if (!next.length) return say('Keep at least one time control.');
    app.timeClasses = next; filtersChanged();
  }
  function setRated(r: typeof app.gamesRated) { app.gamesRated = r; filtersChanged(); }
  function setDay(k: 'gamesFrom' | 'gamesTo', v: string) { app[k] = v; filtersChanged(); }

  let status = $state('');
  let confirm = $state('');
  let asking = $state(false);
  // raw: a deep $state proxy cannot be stored in IndexedDB (DataCloneError on import)
  let pending = $state.raw<Backup | null>(null);
  let pasting = $state(false);
  let pgn = $state('');
  let pasteSide = $state<'auto' | 'w' | 'b'>('auto');
  const say = (s: string) => { status = s; setTimeout(() => (status = ''), 3600); };
  function syncClick() { if (!app.username && !app.lichessUser) return say('Add your chess.com or Lichess username first.'); void syncNow(); }
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
    // the reload shows the loading screen, which unmounts this one: the app-wide notice carries the message
    model.notice = 'Backup imported. Lines regenerated.';
  }
  async function paste() {
    try { const n = await importPgn(pgn, pasteSide); say(n ? `${n} game${n === 1 ? '' : 's'} imported. Analysing.` : 'No new games in that text.'); pgn = ''; pasting = false; }
    catch (e) { say((e as Error).message); }
  }
  async function resetEverything() {
    try {
      // with an account, the reset reaches every device
      const after = await resetAccount();
      await resetAllProgress(after);
    } catch (e) { say('Could not reset your account: ' + (e as Error).message); return; }
    resetSettings();
    location.reload();
  }
  // account
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 30_000); return () => clearInterval(t); });
  const label = $derived((void cloud.status, void cloud.lastAt, syncLabel(now)));
  let leaving = $state<null | number>(null);
  let deleting = $state(false);
  let deleteWord = $state('');
  let accountBusy = $state(false);
  // a new password: after a reset link (cloud.recovering), or a change you ask for
  let changing = $state(false);
  let newPass = $state('');
  let passErr = $state('');
  async function savePassword() {
    accountBusy = true; passErr = '';
    try { await setPassword(newPass); newPass = ''; changing = false; say('Password saved.'); }
    catch (e) { passErr = (e as Error).message; }
    finally { accountBusy = false; }
  }
  async function out(force = false) {
    accountBusy = true;
    try { const r = await logOut(force); if (!r.ok) leaving = r.pending; }
    finally { accountBusy = false; }
  }
  async function removeAccount() {
    accountBusy = true;
    try { await deleteAccount(); } catch (e) { say('Could not delete your account: ' + (e as Error).message); }
    finally { accountBusy = false; }
  }
  const summary = $derived(sync.summary);
  // your own schedule: FSRS weights fitted to your reviews
  let reviewCount = $state(0);
  $effect(() => { void model.rev; void db.reviews.count().then((n) => (reviewCount = n)); });
  let fitting = $state(false);
  async function fit() {
    fitting = true;
    try {
      const r = await fitMySchedule();
      say(r.status === 'fitted' ? `Fitted to ${r.reviews} reviews. Your next reviews use it.` : r.status === 'too-little' ? 'Not enough reviews on later days yet to learn from.' : 'The fit did not work this time; your schedule is unchanged.');
    } finally { fitting = false; }
  }
</script>


<div class="screen settings">
  <header class="screen-head"><h1 class="t-display">Settings</h1></header>
  <div class="pane cols">

  {#if configured && cloud.user}
    <div class="pane grp">
    <div class="sect"><h2 class="t-head">Account</h2></div>
    <section class="card rows">
      <div class="r">
        <div class="grow"><p class="lb">{cloud.user.name}</p><p class="t-small">Logged in with {cloud.user.via}{cloud.user.via !== 'email' && cloud.user.email && !cloud.user.email.endsWith('.invalid') ? ` · ${cloud.user.email}` : ''}</p></div>
      </div>
      <div class="r col">
        <p class="t-small" class:err={cloud.status === 'error'} role="status">{label}</p>
        <button class="btn quiet wide" onclick={() => requestSync()} disabled={cloud.status === 'syncing'}><Icon name="wifi" size={20} /> {cloud.status === 'syncing' ? 'Syncing…' : 'Sync now'}</button>
        <p class="t-small">Your repertoire, cards, reviews, games and settings are kept on your account and sync between your devices. Appearance, sounds and vibration stay per device.</p>
      </div>
      {#if cloud.recovering || changing}
        <div class="r col">
          <p class="t-small">{cloud.recovering ? 'You came in from a password reset link. Choose a new password for your account.' : 'Choose a new password, 8 characters or more.'}</p>
          <form class="row" onsubmit={(e) => { e.preventDefault(); void savePassword(); }}>
            <input class="txt grow" style="text-align:left" type="password" autocomplete="new-password" placeholder="New password" aria-label="New password" bind:value={newPass} />
            <button class="btn sm" type="submit" disabled={newPass.length < 8 || accountBusy}>Save</button>
          </form>
          {#if passErr}<p class="err" role="alert">{passErr}</p>{/if}
          <button class="link" onclick={() => { changing = false; cloud.recovering = false; newPass = ''; passErr = ''; }}>{cloud.recovering ? 'Not now' : 'Cancel'}</button>
        </div>
      {:else if cloud.user.via === 'email'}
        <div class="r"><button class="link" onclick={() => (changing = true)}>Change password</button></div>
      {/if}
      {#if leaving !== null}
        <div class="r col">
          <p class="t-small">The last sync did not go through{leaving ? `, so ${leaving.toLocaleString('en')} change${leaving === 1 ? '' : 's'} on this device would be lost` : ''}. Logging out clears this device.</p>
          <div class="row" style="gap:8px"><button class="btn quiet sm grow" onclick={() => (leaving = null)}>Stay logged in</button><button class="btn sm bad grow" disabled={accountBusy} onclick={() => out(true)}>Log out anyway</button></div>
        </div>
      {:else}
        <div class="r"><button class="link" disabled={accountBusy} onclick={() => out()}>{accountBusy ? 'Syncing…' : 'Log out'}</button><p class="t-small grow" style="text-align:right">Everything stays on your account</p></div>
      {/if}
      {#if !deleting}
        <div class="r"><button class="link danger" onclick={() => (deleting = true)}>Delete my account and synced data</button></div>
      {:else}
        <div class="r col">
          <p class="t-small">This deletes your account and everything synced to it, and clears this device. Your other devices keep what they have until they log in again. Export a backup first if you want a copy. Type DELETE to confirm.</p>
          <div class="row">
            <input class="txt grow" style="text-align:left" placeholder="DELETE" bind:value={deleteWord} autocapitalize="characters" />
            <button class="btn sm bad" disabled={deleteWord !== 'DELETE' || accountBusy} onclick={removeAccount}>Delete</button>
          </div>
        </div>
      {/if}
    </section>
    </div>
  {/if}

  <div class="pane grp">
  <div class="sect"><h2 class="t-head">Mastering</h2></div>
  <section class="card rows">
    <p class="t-small intro">Half of each day's new moves come from the openings you are mastering. Pick as many as you like for each colour; everything else still arrives in the order you are most likely to meet it.</p>
    {#each ops as o (o.key)}
      <label class="r">
        <div class="grow"><p class="lb t-name on">{o.name}</p><p class="t-small">{o.side === 'w' ? 'You play White' : `You play Black, ${o.section.slice(6)}`} · {o.learned} of {o.total} moves learned</p></div>
        <input type="checkbox" role="switch" checked={isFocus(o.side, o.path)} onchange={() => { toggleFocus(o.side, o.path); buzz(8); }} aria-label="Master the {o.name}" />
      </label>
    {/each}
  </section>
  </div>

  <div class="pane grp">
  <div class="sect"><h2 class="t-head">Daily goal</h2></div>
  <section class="card rows">
    <div class="r">
      <div class="grow"><p class="lb">XP a day</p><p class="t-small">About 10 XP for a clean answer</p></div>
      <div class="pick">{#each GOALS as g}<button class:on={app.goal === g} aria-pressed={app.goal === g} onclick={() => { app.goal = g; save(); buzz(8); }}>{g}</button>{/each}</div>
    </div>
  </section>
  </div>

  {#each groups as [title, rows]}
    <div class="pane grp">
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
    </div>
  {/each}

  <div class="pane grp">
  <div class="sect"><h2 class="t-head">Your schedule</h2></div>
  <section class="card rows">
    <div class="r col">
      <p class="t-small">Ply schedules with FSRS's default weights, fitted to millions of Anki reviews. Once you have {MIN_REVIEWS.toLocaleString('en')} reviews, it can fit the weights to how your own memory behaves, on this device. Cards keep their dates; the new weights apply from each card's next review.</p>
      {#if app.fsrsWeights}<p class="t-small"><b>Using your own weights</b>, fitted to {app.fsrsFitReviews.toLocaleString('en')} reviews on {new Date(app.fsrsFitAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.</p>{/if}
      <div class="row" style="gap:8px">
        <button class="btn quiet grow" onclick={fit} disabled={fitting || reviewCount < MIN_REVIEWS}>{fitting ? 'Fitting…' : reviewCount < MIN_REVIEWS ? `${reviewCount.toLocaleString('en')} of ${MIN_REVIEWS.toLocaleString('en')} reviews` : app.fsrsWeights ? 'Fit again' : 'Fit to my reviews'}</button>
        {#if app.fsrsWeights}<button class="btn quiet" onclick={() => { useDefaultWeights(); say('Back to the default weights.'); }}>Defaults</button>{/if}
      </div>
    </div>
  </section>
  </div>

  <div class="pane grp">
  <div class="sect"><h2 class="t-head">Your games</h2></div>
  <section class="card rows">
    <p class="t-small intro">Ply fetches your games when you open it once a day or tap Sync now, and analyses them on this device. Nothing else is sent.</p>
    <label class="r"><p class="lb grow">chess.com</p><input class="txt" placeholder="username" bind:value={app.username} onchange={save} autocapitalize="off" autocomplete="off" spellcheck="false" aria-label="chess.com username" /></label>
    <label class="r"><p class="lb grow">Lichess</p><input class="txt" placeholder="username" bind:value={app.lichessUser} onchange={() => { app.lichessUser = app.lichessUser.trim(); save(); }} autocapitalize="off" autocomplete="off" spellcheck="false" aria-label="Lichess username" /></label>
    <div class="r col">
      <div><p class="lb">Time controls</p><p class="t-small">Classical is Lichess only</p></div>
      <div class="pick wrap">{#each TIME_CLASSES as c}<button class:on={app.timeClasses.includes(c)} aria-pressed={app.timeClasses.includes(c)} onclick={() => flip(c)}>{c}</button>{/each}</div>
    </div>
    <div class="r">
      <p class="lb grow">Games</p>
      <div class="pick">{#each [['rated', 'Rated'], ['casual', 'Casual'], ['both', 'Both']] as const as [k, l]}<button class:on={app.gamesRated === k} aria-pressed={app.gamesRated === k} onclick={() => setRated(k)}>{l}</button>{/each}</div>
    </div>
    <div class="r col">
      <div><p class="lb">Dates</p><p class="t-small">{app.gamesFrom ? '' : 'Without a start, the first sync takes the last three months. '}A change applies from the next sync.</p></div>
      <div class="dates">
        <label><span class="t-small">From</span><input type="date" class="txt" value={app.gamesFrom} max={app.gamesTo || undefined} onchange={(e) => setDay('gamesFrom', (e.target as HTMLInputElement).value)} /></label>
        <label><span class="t-small">To</span><input type="date" class="txt" value={app.gamesTo} min={app.gamesFrom || undefined} onchange={(e) => setDay('gamesTo', (e.target as HTMLInputElement).value)} /></label>
      </div>
    </div>
    <div class="r col">
      <button class="btn quiet wide" onclick={syncClick} disabled={sync.running}><Icon name="wifi" size={20} /> {sync.running ? 'Syncing…' : 'Sync now'}</button>
      {#if sync.text}<p class="t-small">{sync.text}</p>{/if}
      {#if sync.analysing && sync.total}<div class="meter"><i style="width:{(sync.done / sync.total) * 100}%"></i></div>{/if}
      {#if summary}
        <p class="t-small">{summary.imported} new game{summary.imported === 1 ? '' : 's'} · {summary.uncovered} uncovered repl{summary.uncovered === 1 ? 'y' : 'ies'}</p>
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
  </div>


  <div class="pane grp">
  <div class="sect"><h2 class="t-head">Your data</h2></div>
  <section class="card rows">
    <div class="r two">
      <button class="btn grow" onclick={exportBackup}><Icon name="share" size={20} /> Export backup</button>
      <label class="btn quiet grow">Import backup<input type="file" accept="application/json,.json" hidden onchange={pickBackup} /></label>
    </div>
    {#if pending}
      <div class="r col">
        <p class="t-small">Replace everything on this phone with the backup from {pending.exportedAt.slice(0, 10)}? It holds {pending.tables.cards.length} cards and {pending.tables.reviews.length} reviews.{configured && cloud.user ? ' Your account keeps what it has: the next sync merges the two, and a card keeps its latest review.' : ''}</p>
        <div class="row" style="gap:8px"><button class="btn quiet sm grow" onclick={() => (pending = null)}>Cancel</button><button class="btn sm grow" onclick={importBackup}>Replace and import</button></div>
      </div>
    {/if}
    {#if !asking}
      <div class="r"><button class="link danger" onclick={() => (asking = true)}>Reset all progress</button></div>
    {:else}
      <div class="r col">
        <p class="t-small">This deletes every card, review and setting {configured && cloud.user ? 'on this device and on your account, so your other devices reset too' : 'on this phone'}. Type RESET to confirm.</p>
        <div class="row">
          <input class="txt grow" style="text-align:left" placeholder="RESET" bind:value={confirm} autocapitalize="characters" />
          <button class="btn sm bad" disabled={confirm !== 'RESET'} onclick={resetEverything}>Reset</button>
        </div>
      </div>
    {/if}
  </section>
  </div>
  </div>
  {#if status}<p class="status" role="status">{status}</p>{/if}
  <p class="foot">Ply 1.0 · opening data {model.version || '—'} · {model.band} band · GPL-3.0<br />Opening data from the Lichess open database (CC0)<span class="about"> · <button onclick={() => go('/welcome')}>About Ply</button></span></p>
</div>

<style>
  .rows { padding: 4px 16px; }
  .r { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 8px 0; }
  .r + .r { border-top: 1px solid var(--ground); }
  .r.col { flex-direction: column; align-items: stretch; padding: 14px 0; }
  .r.two { padding: 14px 0 16px; }
  .lb { font-weight: 600; }
  .lb.on { font-size: 18px; font-weight: 500; }
  .intro { padding: 14px 0 8px; }
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
  .pick.wrap { flex-wrap: wrap; }
  .dates { display: flex; gap: 10px; }
  .dates label { flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .dates .txt { width: 100%; text-align: left; }
  .pick button { height: 44px; padding: 0 13px; border-radius: 12px; background: var(--ground); font-weight: 650; font-size: 14px; color: var(--ink-2); }
  .pick button.on { background: var(--ink); color: var(--on-ink); }
  .link.danger { color: var(--bad-text); }
  .btn.sm { min-height: 44px; }
  .btn.bad { --face: var(--bad); --edge: #911101; }
  .status { margin-top: 14px; padding: 12px 14px; border-radius: 14px; background: var(--ink); color: var(--on-ink); font-size: 14px; animation: rise 200ms var(--ease) both; }
  .meter { height: 8px; border-radius: 4px; background: var(--ground); overflow: hidden; }
  .meter i { display: block; height: 100%; background: var(--good); }
  .err { color: var(--bad-text); font-weight: 600; font-size: 14px; }
  .lapsed { margin: 0; padding-left: 18px; font-size: 13px; color: var(--ink-2); }
  .pgn { width: 100%; border: 0; border-radius: 14px; background: var(--ground); padding: 12px; font: 13px/1.4 ui-monospace, monospace; color: var(--ink); user-select: text; resize: vertical; }
  .r.col { gap: 10px; }
  .foot { text-align: center; font-size: 12.5px; color: var(--ink-3); margin-top: 26px; }
  .about { display: none; }
  .about button { color: var(--accent-text); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
  /* ---------- desktop: the same cards in balanced columns (DESIGN.md, "Desktop") ---------- */
  @media (min-width: 1024px) and (min-height: 600px) {
    .screen.settings { padding: 28px max(32px, calc((100% - 1480px) / 2)) 48px; }
    .settings .cols { display: block; columns: 2; column-gap: 28px; }
    .settings .grp { display: block; break-inside: avoid; padding-bottom: 2px; }
    .settings .grp .sect { margin-top: 0; padding-top: 18px; }
    .settings .stepper button, .settings .pick button { transition: background 120ms, transform 90ms; }
    .settings .stepper button:hover { background: var(--cobalt-tint); }
    .settings .pick button:not(.on):hover { background: var(--line); color: var(--ink); }
    .settings .btn:not(:disabled):hover { filter: brightness(1.06); }
    .settings label.r { cursor: pointer; }
    .about { display: inline; }
    .settings .status { position: fixed; z-index: 30; left: 50%; bottom: 28px; margin: 0 0 0 -180px; width: 360px; box-shadow: var(--shadow); }
  }
  @media (min-width: 1600px) and (min-height: 600px) { .settings .cols { columns: 3; } }
</style>
