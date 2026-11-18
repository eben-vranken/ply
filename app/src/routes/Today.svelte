<script lang="ts">
  import { app, go, run } from '../lib/state.svelte';
  import { catchUpDay, startCatchUp, stopCatchUp, studyDay } from '../lib/model.svelte';
  import { shouldOffer, suggestDays, daysAway } from '../lib/srs/catchup';
  import { model, todayCounts, itemsFor, requeue, arcade, allCards, grantExtraNew, mastering, learnRound, learnNext, drillLine, type Mastery } from '../lib/model.svelte';
  import { levelOf, xpToday } from '../lib/game';
  import { countup } from '../lib/countup';
  import { greet } from '../lib/voice';
  import Mascot from '../lib/Mascot.svelte';
  import { loadStats, type StatsData } from '../lib/stats';
  import { sync } from '../lib/import/sync.svelte';
  import type { Item } from '../lib/session';
  import { dayStart } from '../lib/srs/queue';
  import { whenText } from '../lib/srs/fsrs';
  import Sigil from '../lib/Sigil.svelte';
  import Icon from '../lib/Icon.svelte';
  import { storageAtRisk } from '../lib/platform';
  import { save } from '../lib/state.svelte';
  import { desk } from '../lib/desk.svelte';
  import { takeOff, takeOffFrom } from '../lib/flight';

  const counts = $derived.by(() => { void model.rev; return todayCounts(); });
  const firstItems = $derived(itemsFor(counts.queue.slice(0, 1)));
  const next = $derived<Item | undefined>(firstItems[0]);
  const nextPath = $derived(next ? [...next.setup, ...next.moves].slice(0, 6) : []);
  const nextName = $derived(next?.label.replace(/ \([A-E]\d\d\)$/, '') ?? '');
  const nextEco = $derived(next?.label.match(/\(([A-E]\d\d)\)$/)?.[1] ?? '');
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayIdx = (new Date().getDay() + 6) % 7;
  const atRisk = $derived(!app.storageNoteSeen && storageAtRisk());
  const staleBackup = $derived(allCards().size > 0 && Date.now() - app.lastBackup > 7 * 864e5);
  const rollText = $derived(`${String(app.rollover).padStart(2, '0')}:00`);
  // learning cards due again before the next rollover
  const nextDue = $derived.by(() => {
    void model.rev;
    const now = Date.now(), end = dayStart(now, app.rollover) + 864e5;
    const soon = [...allCards().values()].filter((c) => !c.suspended && c.fsrs.state !== 0 && c.due > now && c.due < end);
    return soon.length ? { n: soon.length, at: Math.min(...soon.map((c) => c.due)) } : null;
  });

  let stats = $state<StatsData | null>(null);
  // catching up after time away: offered for a real backlog, and the due count stays the real one
  const cuDay = $derived.by(() => { void model.rev; void app.catchUp; return catchUpDay(); });
  const away = $derived(stats ? daysAway(stats.history.slice(0, -1).concat(0)) : 0);
  const offer = $derived(cuDay === null && app.catchUpDeclined !== studyDay() && shouldOffer(counts.dueAll, app.maxReviews, away));
  let cuDays = $state(0);
  const cuPick = $derived(cuDays || suggestDays(counts.dueAll));
  $effect(() => { void model.rev; void loadStats(allCards().values(), app.rollover).then((s) => (stats = s)); });

  // desktop: what today's session is made of, and the cards in the order they come
  const qItems = $derived(desk.on ? itemsFor(counts.queue) : []);
  const qKinds = $derived.by(() => { const m = new Map<string, number>(); for (const i of qItems) m.set(i.kind, (m.get(i.kind) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); });
  let artEl = $state<HTMLElement>();
  function start() {
    takeOff(artEl?.querySelector('svg'));
    run.items = itemsFor(counts.queue); run.mode = 'today'; run.title = 'Today';
    run.more = () => requeue();
    go('/train');
  }
  function extra() {
    grantExtraNew(5);
    const q = todayCounts().queue.filter((i) => i.kind === 'new');
    if (!q.length) return;
    run.items = itemsFor(q); run.mode = 'today'; run.title = 'Extra new moves'; run.more = () => requeue();
    go('/train');
  }
  /** endless positions with their own rating; nothing here reaches the cards */
  function playArcade() {
    const a = arcade();
    const first = a.next();
    if (!first.length) return;
    run.items = first; run.mode = 'drill'; run.title = 'Arcade'; run.rare = false; run.more = () => a.next(); run.arcade = a.result;
    go('/train');
  }
  // the game layer
  const lvl = $derived(levelOf(app.xp));
  const xp = $derived.by(() => { void app.xpToday; void app.xpDay; return xpToday(); });
  const goalPct = $derived(Math.min(1, xp / app.goal));
  const lit = $derived(stats?.week[todayIdx] ?? false);
  const mins = $derived(Math.max(1, Math.round((counts.due * 8 + counts.fresh * 25) / 60)));
  const say = $derived(greet({ streak: stats?.streak ?? 0, lit, left: counts.queue.length, done: counts.done, goal: goalPct >= 1, fresh: allCards().size === 0 && counts.done === 0, mins, froze: !!stats?.frozen.has(369) }));
  const rep = $derived(stats?.report ?? null);
  const delta = $derived(rep?.before && rep.recent.eval10 !== null && rep.before.eval10 !== null ? rep.recent.eval10 - rep.before.eval10 : null);
  const proof = $derived.by(() => {
    if (!rep || rep.recent.eval10 === null) return '';
    const now = fmt(rep.recent.eval10);
    if (delta !== null && delta >= 0.15) return `You now leave the opening at ${now} on average, up from ${fmt(rep.before!.eval10)}. The work is showing.`;
    if (delta !== null && delta <= -0.15) return `You leave the opening at ${now}, down from ${fmt(rep.before!.eval10)}. See which replies took you out of book in Repertoire.`;
    return `You leave the opening at ${now} on average. ${rep.recent.covered >= 70 ? 'Your lines covered most of what you met.' : 'Opponents left your lines often: see Uncovered in Repertoire.'}`;
  });
  const HUES = ['#254bd2', '#c82611', '#018359', '#a77602', '#844bc6', '#067c8e'];
  const ms = $derived(mastering());
  const openTree = (m: Mastery) => go(`/tree?side=${m.side}&p=${encodeURIComponent(m.path.join(' '))}`);
  /** five new moves of an opening you are learning, round after round, or a drill through it once all are learned */
  function train(m: Mastery) {
    const first = learnRound(m.side, m.path);
    if (first.length) {
      run.items = first; run.mode = 'learn'; run.title = m.name; run.arcade = undefined;
      run.more = (missed: Item[]) => [...missed.map((x) => ({ ...x, asks: Object.fromEntries(Object.entries(x.asks).map(([k, a]) => [k, { ...a, intro: false, graded: false }])), prompt: 'Your move', spec: undefined })), ...learnRound(m.side, m.path)];
      return go('/train');
    }
    const l = drillLine(m.side, m.path, false);
    if (!l) return;
    run.items = [l]; run.mode = 'drill'; run.title = m.name; run.arcade = undefined;
    run.more = () => { const n = drillLine(m.side, m.path, false); return n ? [n] : []; };
    go('/train');
  }
  const kindLine: Record<string, string> = { line: 'Review', new: 'New move', punish: 'Punish', danger: 'Danger', puzzle: 'Puzzle', mistake: 'Your mistake', drill: 'Drill' };
  const spark = (v: number[]) => v.length < 2 ? '' : v.map((y, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1)) * 300} ${20 - Math.max(-2, Math.min(2, y)) * 12}`).join(' ');
  const fmt = (x: number | null) => (x === null ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1));
</script>

{#snippet head()}
  <header class="screen-head">
    <div>
      <p class="t-small">{date}</p>
      <h1 class="t-display">Today</h1>
    </div>
    <div class="hud">
      <div class="pillb" class:lit aria-label="{stats?.streak ?? 0} day streak{lit ? '' : ', nothing done yet today'}">
        <Icon name="flame" size={20} fill /><b class="t-num">{stats?.streak ?? 0}</b>
        {#if stats?.freezes}<span class="frz" title="Streak freezes: a missed day uses one instead of ending the streak"><Icon name="freeze" size={15} /><b class="t-num">{stats.freezes}</b></span>{/if}
      </div>
      <div class="pillb lv" aria-label="Level {lvl.level}, {lvl.rank}">
        <span class="pc" aria-hidden="true">{lvl.level}</span><b>{lvl.rank}</b>
      </div>
    </div>
  </header>
{/snippet}

{#snippet birch()}
  {#key say.text}
    <div class="birch">
      <Mascot mood={say.mood} size={64} />
      <p class="bubble">{say.text}</p>
    </div>
  {/key}
{/snippet}

{#snippet goal()}
  <section class="card goal" aria-label="Daily goal: {xp} of {app.goal} XP">
    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--line)" stroke-width="8" />
      <circle cx="32" cy="32" r="26" fill="none" stroke={goalPct >= 1 ? 'var(--good)' : 'var(--sun)'} stroke-width="8" stroke-linecap="round" stroke-dasharray="163.4" stroke-dashoffset={163.4 * (1 - goalPct)} transform="rotate(-90 32 32)" />
      {#if goalPct >= 1}<path d="M22 33l7 7 14-15" fill="none" stroke="var(--good)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />{:else}<text x="32" y="38" text-anchor="middle">{Math.round(goalPct * 100)}</text>{/if}
    </svg>
    <div class="grow">
      <p class="gl"><b class="t-num" use:countup={xp}></b> / {app.goal} XP <span>{goalPct >= 1 ? 'Daily goal reached' : lit ? 'today' : stats?.streak ? `keeps your ${stats.streak} day streak` : 'starts a streak'}</span></p>
      <div class="lvrow"><span>Level {lvl.level}</span><span class="lbar"><i style="width:{(lvl.into / lvl.span) * 100}%"></i></span><span class="t-num">{lvl.span - lvl.into} to go</span></div>
    </div>
  </section>
{/snippet}

{#snippet hero()}
  <section class="slab" style="animation: rise 420ms var(--ease) both">
    {#if next}
      <div class="art" bind:this={artEl}><Sigil path={nextPath} size={176} bare draw flip={next.side === 'b'} you={next.side} hue="var(--cobalt)" /></div>
      <p class="up">First up · {kindLine[next.kind]}</p>
      <h2 class="t-name name">{nextName.split(':')[0]}</h2>
      <p class="sub">{nextName.includes(':') ? nextName.split(': ')[1] : next.side === 'w' ? 'You play White' : 'You play Black'} {#if nextEco}<span class="eco">{nextEco}</span>{/if}</p>
      <dl class="counts">
        <div><dd class="t-num">{counts.dueAll}</dd><dt>Due{#if counts.dueAll > counts.due}<span class="share"> · {counts.due} today</span>{/if}</dt></div>
        <div><dd class="t-num">{counts.fresh}</dd><dt>New</dt></div>
        <div><dd class="t-num">{counts.done}</dd><dt>Done today</dt></div>
      </dl>
      <button class="btn big wide cta" onclick={start}><Icon name="play" size={20} fill /> {counts.done ? 'Continue' : 'Start'} <small>about {mins} min</small></button>
    {:else}
      <div class="art done"><span class="tick"><Icon name="check" size={56} /></span></div>
      <p class="up">{counts.done} answer{counts.done === 1 ? '' : 's'} today</p>
      <h2 class="t-name name">Done for today</h2>
      <p class="sub">{nextDue ? `${nextDue.n} card${nextDue.n === 1 ? '' : 's'} come${nextDue.n === 1 ? 's' : ''} back ${whenText(nextDue.at)}.` : `Nothing else is due until tomorrow, ${rollText}.`}</p>
      <div class="row" style="margin-top:22px">
        <button class="btn grow" onclick={playArcade}><Icon name="sword" size={18} /> Arcade</button>
        <button class="btn quiet" onclick={extra}><Icon name="plus" size={18} /> 5 new</button>
      </div>
    {/if}
    <div class="edge" aria-hidden="true"></div>
  </section>
{/snippet}

{#snippet catchUp()}
  {#if cuDay !== null && app.catchUp}
    <div class="card catch on" role="status">
      <Icon name="layers" size={22} />
      <p class="grow"><b>Catching up · day {cuDay + 1} of {app.catchUp.days}</b><br /><span class="t-small">{app.catchUp.perDay} reviews a day, the ones closest to slipping first. New moves wait until you are through.</span></p>
      <button class="link" onclick={() => stopCatchUp()}>Stop</button>
    </div>
  {:else if offer}
    <section class="card catch">
      <p><b>Welcome back. {counts.dueAll} reviews piled up.</b></p>
      <p class="t-small">Take them in one go, or spread them over a few days: an even share each day, the ones closest to slipping first, and no new moves until you are through. The due count always shows everything.</p>
      <div class="cud" role="group" aria-label="Days to catch up over">
        {#each [3, 5, 7] as d}<button class:on={cuPick === d} aria-pressed={cuPick === d} onclick={() => (cuDays = d)}>{d} days<small>{Math.ceil(counts.dueAll / d)} a day</small></button>{/each}
      </div>
      <div class="row" style="gap:8px">
        <button class="btn quiet sm" onclick={() => stopCatchUp(true)}>All at once</button>
        <button class="btn sm grow" onclick={() => startCatchUp(counts.dueAll, cuPick)}>Catch up over {cuPick} days</button>
      </div>
    </section>
  {/if}
{/snippet}

{#snippet queue()}
  <section class="card queue" aria-label="Today's queue">
    <div class="qh"><h2 class="t-head">The queue</h2><span class="t-small">{counts.queue.length ? `${qItems.length} card${qItems.length === 1 ? '' : 's'} · about ${mins} min` : 'Empty'}</span></div>
    {#if qItems.length}
      <div class="qbar" role="img" aria-label={qKinds.map(([k, c]) => `${c} ${kindLine[k]}`).join(', ')}>{#each qKinds as [k, c]}<i class="k-{k}" style="flex:{c}"></i>{/each}</div>
      <p class="qleg">{#each qKinds as [k, c]}<span><i class="k-{k}"></i>{kindLine[k]} <b class="t-num">{c}</b></span>{/each}</p>
      <ol class="qlist">
        {#each qItems.slice(0, 5) as it, i}
          <li><span class="qn t-num">{i + 1}</span><span class="grow"><span class="t-name qname">{it.label.replace(/ \([A-E]\d\d\)$/, '')}</span><span class="qord">{it.order}</span></span><span class="qk k-{it.kind}">{kindLine[it.kind]}</span></li>
        {/each}
      </ol>
      {#if qItems.length > 5}<p class="t-small qmore">and {qItems.length - 5} more, in the order the schedule wants them</p>{/if}
    {:else}
      <p class="t-small">{nextDue ? `${nextDue.n} card${nextDue.n === 1 ? '' : 's'} come${nextDue.n === 1 ? 's' : ''} back ${whenText(nextDue.at)}.` : `Nothing else is due until tomorrow, ${rollText}.`}</p>
    {/if}
  </section>
{/snippet}

{#snippet mastery()}
  <div class="sect"><h2 class="t-head">Learning</h2><button class="link" onclick={() => go('/repertoire')}>All openings</button></div>
  <div class="mast" class:one={ms.length < 2}>
    {#each ms as m, i (m.side + m.path.join(' '))}
      <article class="card mc">
        <button class="mtop" onclick={() => openTree(m)} aria-label="Open the {m.name} tree">
          <Sigil path={m.path.slice(0, 8)} hue={HUES[i % HUES.length]} flip={m.side === 'b'} you={m.side} size={52} />
          <span class="grow"><span class="t-name mn">{m.name}</span><span class="mm">{m.side === 'w' ? 'White' : 'Black'} · {m.done ? 'learned' : `${m.learned} of ${m.total} moves`}</span></span>
          <span class="mp t-num">{m.pct}<small>%</small></span>
        </button>
        <span class="mbar" role="img" aria-label="{m.stages[3]} mature, {m.stages[2]} young, {m.stages[1]} learning, {m.stages[0]} new">
          {#each ['mature', 'young', 'learning', 'new'] as st, k}<i style="flex:{m.stages[3 - k]};background:var(--st-{st})"></i>{/each}
        </span>
        {#if m.chapters.length > 1}
          {@const at = m.chapters.findIndex((c) => c.learned < c.total)}
          <p class="chap"><b>{at < 0 ? 'Every chapter learned' : `Chapter ${at + 1} of ${m.chapters.length}`}</b>{#if at >= 0} · {m.chapters[at].name} · {m.chapters[at].learned}/{m.chapters[at].total}{/if}</p>
          <span class="chs" aria-hidden="true">{#each m.chapters as c}<i style="flex:{Math.max(c.total, m.total / 14)}"><b style="width:{(c.learned / c.total) * 100}%"></b></i>{/each}</span>
        {/if}
        {#if m.done && m.next}
          <p class="chap"><b>Every move learned.</b> Its reviews go on as before.</p>
          <div class="row" style="gap:8px">
            <button class="btn sm grow" onclick={() => learnNext(m)}>Learn next: {m.next.name}</button>
            <button class="btn sm quiet" onclick={(e) => { takeOffFrom(e); train(m); }}>Drill it</button>
          </div>
        {:else}
          <button class="btn wide sm" class:quiet={!m.fresh} onclick={(e) => { takeOffFrom(e); train(m); }}>{m.fresh ? `Learn ${Math.min(5, m.fresh)} new moves` : 'Drill it'}</button>
        {/if}
      </article>
    {:else}
      <button class="card pickone" onclick={() => go('/repertoire')}>
        <span class="star"><Icon name="star" size={22} fill /></span>
        <span class="grow"><b>Pick an opening to learn</b><br /><span class="t-small">Open one in Repertoire and tap its star. Every new move then comes from it, one opening at a time.</span></span>
        <Icon name="next" size={18} />
      </button>
    {/each}
  </div>
{/snippet}

{#snippet arcadeCard()}
  <section class="card arc">
    <div class="grow">
      <h3 class="t-head">Arcade</h3>
      <p class="t-small">Endless Lichess puzzles from your openings, at your level. Your cards stay as they are.</p>
      <p class="arcnum"><span><b class="t-num">{app.arcadeRating}</b> rating</span><span class="fl"><Icon name="flame" size={17} fill /><b class="t-num">{app.arcadeBest}</b> best streak</span><span><b class="t-num">{app.arcadeSolved}</b> solved</span></p>
    </div>
    <button class="btn" onclick={playArcade} aria-label="Play Arcade"><Icon name="play" size={20} fill /></button>
  </section>
{/snippet}

{#snippet syncing()}
  {#if sync.analysing || sync.running}
    <div class="card syncing" role="status">
      <p class="t-small">{sync.text}</p>
      {#if sync.total}<div class="meter"><i style="width:{(sync.done / sync.total) * 100}%"></i></div>{/if}
    </div>
  {/if}
{/snippet}

{#snippet duo()}
  <div class="duo">
    <section class="card">
      <p class="t-small">7-day retention</p>
      <p class="pct t-num">{stats?.retention7 ?? '—'}{#if stats?.retention7 != null}<small>%</small>{/if}</p>
      <div class="meter" role="img" aria-label="{stats?.retention7 ?? 0} percent, target {app.retention} percent"><i style="width:{stats?.retention7 ?? 0}%"></i><b style="left:{app.retention}%"></b></div>
      <p class="t-small">Target {app.retention}%</p>
    </section>
    <section class="card">
      <p class="t-small">This week</p>
      <div class="week">
        {#each week as d, i}
          {@const hit = stats?.week[i] ?? false}
          {@const ice = stats?.weekFrozen[i] ?? false}
          <div class:hit class:ice class:now={i === todayIdx}>
            <span>{#if hit}<Icon name="check" size={13} />{:else if ice}<Icon name="freeze" size={13} />{/if}</span>{d}
          </div>
        {/each}
      </div>
      <p class="t-small" style="margin-top:10px">Longest streak {stats?.longest ?? 0} day{stats?.longest === 1 ? '' : 's'}{stats?.freezes ? ` · ${stats.freezes} freeze${stats.freezes === 1 ? '' : 's'}` : ''}</p>
    </section>
  </div>
{/snippet}

{#snippet banners()}
  {#if atRisk}
    <div class="banner risk" role="note">
      <Icon name="warn" size={20} />
      <span class="grow"><b>Keep Ply on your Home Screen</b><br /><span class="t-small">Safari deletes a website's saved data after 7 days without a visit. Added to the Home Screen (Share, then Add to Home Screen; on a Mac, File, then Add to Dock), Ply keeps your progress. Export a backup now and then too.</span></span>
      <button class="x" onclick={() => { app.storageNoteSeen = true; save(); }} aria-label="Got it"><Icon name="close" size={18} /></button>
    </div>
  {/if}
  {#if staleBackup}
    <button class="banner" onclick={() => go('/settings')}>
      <Icon name="share" size={20} />
      <span class="grow"><b>No backup in over a week</b><br /><span class="t-small">Export one from Settings</span></span>
      <Icon name="next" size={18} />
    </button>
  {/if}
{/snippet}

{#snippet games()}
  <section class="card games">
    <div><h3 class="t-head">Is it working?</h3><p class="t-small">Your last {rep?.recent.games ?? 10} analysed games against the ones before</p></div>
    {#if rep && proof}
      <div class="proof"><Mascot mood={delta !== null && delta <= -0.15 ? 'think' : 'cheer'} size={44} still /><p>{proof}</p></div>
      <dl class="rep">
        <div><dd class="t-num">{fmt(rep.recent.eval10)}</dd><dt>after move 10{#if delta !== null}<b class:up={delta >= 0}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}</b>{/if}</dt></div>
        <div><dd class="t-num">{rep.recent.covered}<small>%</small></dd><dt>inside your lines</dt></div>
        <div><dd class="t-num">{rep.recent.win}<small>%</small></dd><dt>won</dt></div>
      </dl>
    {/if}
    {#if stats && stats.spark10.length > 1}
      <svg viewBox="-4 -6 308 52" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" x2="300" y1="20" y2="20" stroke="var(--line)" stroke-dasharray="3 4" />
        <path d={spark(stats.spark15)} fill="none" stroke="var(--birch-3)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <path d={spark(stats.spark10)} fill="none" stroke="var(--cobalt)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <div class="legend">
        <span><i style="background:var(--cobalt)"></i>After move 10 <b>{fmt(stats.avg10)}</b></span>
        <span><i style="background:var(--birch-3)"></i>After move 15 <b>{fmt(stats.avg15)}</b></span>
      </div>
    {:else}
      <p class="t-small empty">{app.username || app.lichessUser ? 'Appears once a few of your games are analysed.' : 'Add your chess.com or Lichess name in Settings to see how you leave the opening.'}</p>
    {/if}
  </section>
{/snippet}

{#if desk.on}
  <!-- desktop: a dashboard. The work on the left, the state of things on the right (DESIGN.md, "Desktop") -->
  <div class="screen today">
    <div class="dash">
      <div class="col main">
        {@render head()}
        {@render hero()}
        {@render catchUp()}
        {@render queue()}
        {@render mastery()}
      </div>
      <div class="col aside">
        {@render birch()}
        {@render goal()}
        {@render duo()}
        {@render arcadeCard()}
        {@render syncing()}
        {@render games()}
        {@render banners()}
      </div>
    </div>
  </div>
{:else}
  <div class="screen">
    {@render head()}
    {@render birch()}
    {@render goal()}
    {@render hero()}
    {@render catchUp()}
    {@render mastery()}
    {@render arcadeCard()}
    {@render syncing()}
    {@render duo()}
    {@render banners()}
    {@render games()}
  </div>
{/if}

<style>
  .hud { display: flex; gap: 8px; }
  .birch { display: flex; align-items: center; gap: 10px; margin: -4px 0 12px; }
  .bubble { position: relative; flex: 1; padding: 11px 14px; border-radius: 18px; background: var(--card); box-shadow: var(--shadow); font-size: 14.5px; line-height: 1.32; color: var(--ink); animation: rise 360ms var(--spring) both; }
  .bubble::before { content: ''; position: absolute; left: -6px; top: 50%; width: 14px; height: 14px; margin-top: -7px; background: var(--card); border-radius: 3px; transform: rotate(45deg); }
  .chap { font-size: 13px; color: var(--ink-2); margin: -4px 0 -6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chap b { color: var(--ink); font-weight: 650; }
  .chs { display: flex; gap: 3px; height: 6px; }
  .chs i { border-radius: 3px; background: var(--line); overflow: hidden; min-width: 0; }
  .chs b { display: block; height: 100%; background: var(--cobalt); border-radius: 3px; }
  .proof { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 10px 12px; border-radius: 16px; background: var(--ground); font-size: 14.5px; line-height: 1.32; }
  .rep { display: flex; gap: 8px; margin: 10px 0 0; }
  .rep div { flex: 1; background: var(--ground); border-radius: 14px; padding: 10px 10px 8px; }
  .rep dd { margin: 0; font-size: 24px; line-height: 1; }
  .rep dd small { font-size: 14px; color: var(--ink-3); }
  .rep dt { font-size: 11.5px; color: var(--ink-2); margin-top: 4px; }
  .rep dt b { display: block; color: var(--warn-text); font-size: 11.5px; }
  .rep dt b.up { color: var(--good-text); }
  /* the two things that are alive on this screen: the flame once today counts, and the way in */
  .pillb.lit :global(svg) { transform-origin: 50% 90%; animation: flick 1.7s ease-in-out infinite; }
  @keyframes flick { 0%, 100% { transform: scale(1) rotate(0); } 30% { transform: scale(1.12, 1.2) rotate(-4deg); } 60% { transform: scale(0.96, 1.06) rotate(3deg); } }
  .cta::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; animation: ring 2.4s ease-out infinite; }
  @keyframes ring { 0% { box-shadow: 0 0 0 0 rgba(43, 75, 238, 0.55); } 70%, 100% { box-shadow: 0 0 0 16px rgba(43, 75, 238, 0); } }
  .goal circle:nth-of-type(2) { animation: ringin 900ms var(--ease) both; }
  @keyframes ringin { from { stroke-dashoffset: 163.4; } }
  .pillb { display: flex; gap: 5px; height: 44px; padding: 0 14px 0 10px; background: var(--card); border-radius: 99px; box-shadow: var(--shadow); align-items: center; color: var(--ink-3); }
  .pillb b { font-size: 18px; color: var(--ink); }
  .pillb.lit :global(svg) { color: #f87e1a; }
  .pillb.lv b { font-size: 14.5px; font-weight: 650; }
  .pillb .pc { display: grid; place-items: center; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 9px; background: var(--sun); color: #3c2a0b; font-weight: 800; font-size: 14px; box-shadow: 0 2px 0 #be8709; }

  .goal { display: flex; align-items: center; gap: 14px; padding: 12px 16px 12px 12px; margin-bottom: 12px; }
  .goal svg { flex: none; }
  .goal circle { transition: stroke-dashoffset 700ms var(--ease); }
  .goal text { font-family: var(--sans); font-size: 17px; font-weight: 750; fill: var(--ink); }
  .gl { font-size: 15px; color: var(--ink-2); }
  .gl b { font-size: 24px; color: var(--ink); }
  .gl span { display: block; font-size: 13px; margin-top: 1px; }
  .lvrow { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 12.5px; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
  .lbar { flex: 1; height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; }
  .lbar i { display: block; height: 100%; border-radius: 4px; background: var(--sun); transition: width 600ms var(--ease); }
  .slab .btn small { font-size: 14px; font-weight: 500; opacity: 0.8; margin-left: 4px; }

  .mast { display: flex; gap: 12px; overflow-x: auto; margin: 0 -16px; padding: 2px 16px 14px; scroll-snap-type: x mandatory; scrollbar-width: none; }
  .mast::-webkit-scrollbar { display: none; }
  .mc { flex: none; width: 82%; scroll-snap-align: center; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
  .mast.one .mc, .pickone { width: 100%; }
  .mtop { display: flex; align-items: center; gap: 12px; text-align: left; width: 100%; }
  .mn { display: block; font-size: 20px; line-height: 1.1; }
  .mm { display: block; font-size: 13px; color: var(--ink-2); margin-top: 3px; }
  .mp { font-size: 26px; }
  .mp small { font-size: 14px; color: var(--ink-3); }
  .mbar { display: flex; gap: 2px; height: 8px; }
  .mbar i { border-radius: 3px; min-width: 0; }
  .btn.sm { min-height: 46px; font-size: 16px; border-radius: 14px; box-shadow: 0 4px 0 var(--edge); }
  .pickone { display: flex; align-items: center; gap: 12px; text-align: left; }
  .pickone .star { flex: none; width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--sun-tint); color: var(--warn-text); }

  .slab { position: relative; color: var(--ink-fixed); background: var(--birch); border-radius: var(--r-xl); padding: 22px 20px 34px; overflow: hidden; box-shadow: 0 18px 28px -16px rgba(111, 76, 44, 0.55); }
  .slab .edge { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: linear-gradient(#d0b386 0 2px, #ad8c59 2px 5px, #e1c69e 5px 8px, #9b7a45 8px 11px, #d0b386 11px 14px); }
  .art { position: absolute; right: -22px; top: -18px; color: var(--walnut); transform: rotate(8deg); }
  .art.done { right: 14px; top: 18px; transform: none; }
  .tick { display: grid; place-items: center; width: 92px; height: 92px; border-radius: 50%; background: var(--good); color: #fff; animation: pop 420ms var(--spring) both; }
  .up { font-size: 14px; font-weight: 650; color: var(--walnut); position: relative; }
  .name { font-size: 46px; line-height: 0.98; margin-top: 4px; max-width: 250px; position: relative; }
  .sub { margin-top: 8px; font-size: 15px; color: var(--walnut); position: relative; max-width: 240px; }
  .arc { display: flex; align-items: center; gap: 14px; }
  .arc .btn { flex: none; width: 60px; min-height: 60px; padding: 0; border-radius: 20px; }
  .arcnum { margin-top: 10px; font-size: 13px; color: var(--ink-2); display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; }
  .arcnum .fl { display: inline-flex; align-items: baseline; gap: 2px; }
  .arcnum .fl :global(svg) { color: #f87e1a; align-self: center; }
  .arcnum b { font-size: 20px; color: var(--ink); margin-right: 2px; }
  .counts { display: flex; gap: 8px; margin: 22px 0 18px; }
  .counts div { flex: 1; background: rgba(255, 255, 255, 0.55); border-radius: 16px; padding: 10px 12px 9px; }
  .counts dd { margin: 0; font-size: 30px; line-height: 1; }
  .counts dt .share { font-weight: 500; }
  .catch { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
  .catch.on { flex-direction: row; align-items: center; gap: 12px; background: var(--cobalt-tint); color: var(--ink); }
  .catch.on :global(svg) { color: var(--accent-text); flex: none; }
  .cud { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .cud button { display: flex; flex-direction: column; align-items: center; padding: 9px 0 8px; border-radius: 14px; background: var(--ground); font-weight: 700; box-shadow: inset 0 0 0 2px transparent; }
  .cud button.on { box-shadow: inset 0 0 0 2.5px var(--cobalt); }
  .cud small { font-size: 12px; font-weight: 500; color: var(--ink-2); }
  .catch .btn.sm { min-height: 46px; font-size: 15px; border-radius: 14px; box-shadow: 0 4px 0 var(--edge); }
  .counts dt { font-size: 12.5px; font-weight: 600; color: var(--walnut); margin-top: 3px; }

  .syncing { margin-top: 12px; }
  .syncing .meter { margin: 10px 0 0; }
  .duo { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
  .pct { font-size: 44px; line-height: 1; margin: 2px 0 10px; }
  .pct small { font-size: 22px; margin-left: 2px; color: var(--ink-3); }
  .meter { position: relative; height: 8px; border-radius: 4px; background: var(--line); margin-bottom: 8px; }
  .meter i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: var(--good); }
  .meter b { position: absolute; top: -4px; width: 2px; height: 16px; background: var(--ink); border-radius: 1px; }
  .week { display: flex; justify-content: space-between; margin-top: 12px; }
  .week div { display: flex; flex-direction: column; align-items: center; gap: 5px; font-size: 11px; font-weight: 650; color: var(--ink-3); }
  .week span { width: 17px; height: 26px; border-radius: 6px; border: 1.6px solid var(--line); display: grid; place-items: center; color: #fff; }
  .week .hit span { background: var(--cobalt); border-color: var(--cobalt); }
  .week .ice span { background: #68c4f1; border-color: #68c4f1; color: #03435c; }
  .frz { display: inline-flex; align-items: center; gap: 2px; margin-left: 6px; padding-left: 8px; border-left: 1.5px solid var(--line); color: #3e8aae; }
  .frz b { font-size: 15px !important; color: #3e8aae !important; }
  .week .now { color: var(--ink); }
  .week .now span { border-color: var(--ink); }
  .week .now.hit span { border-color: var(--cobalt); }

  .banner { width: 100%; text-align: left; display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 14px 16px; border-radius: var(--r-l); background: var(--sun-tint); color: var(--sun-ink); min-height: 56px; font-size: 15px; }
  .banner .t-small { color: var(--sun-ink); }
  .banner.risk { align-items: flex-start; }
  .banner .x { width: 44px; height: 44px; margin: -10px -10px -10px 0; display: grid; place-items: center; flex: none; }
  .games { margin-top: 12px; }
  .games svg { width: 100%; height: 76px; margin: 12px 0 8px; overflow: visible; }
  .games .empty { margin-top: 10px; }
  .legend { display: flex; gap: 18px; font-size: 13px; color: var(--ink-2); }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
  .legend b { color: var(--ink); margin-left: 4px; }

  /* ---------- desktop: the dashboard (DESIGN.md, "Desktop") ---------- */
  @media (min-width: 1024px) and (min-height: 600px) {
    .today { padding: 28px 32px 48px; }
    .dash { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(320px, 1fr); gap: 28px; max-width: 1480px; margin: 0 auto; align-items: start; }
    .col { display: flex; flex-direction: column; min-width: 0; }
    .col > :global(*) { animation: rise 420ms var(--ease) both; }
    .col > :global(*:nth-child(2)) { animation-delay: 45ms; }
    .col > :global(*:nth-child(3)) { animation-delay: 90ms; }
    .col > :global(*:nth-child(n + 4)) { animation-delay: 135ms; }
    .aside { position: sticky; top: 0; gap: 14px; padding-top: 6px; }
    .aside :global(.birch) { margin: 0; }
    .aside .goal, .aside .duo, .aside .games, .aside .banner, .aside .syncing { margin: 0; }
    .aside .duo { grid-template-columns: 1fr 1fr; }
    .today .slab { padding: 30px 32px 44px; }
    .today .slab .art { right: -34px; top: -56px; }
    .today .slab .art :global(svg) { width: 290px; height: 290px; }
    .today .name { font-size: clamp(52px, 4.6vw, 76px); max-width: 62%; }
    .today .sub { max-width: 52%; font-size: 16px; }
    .today .counts { max-width: 520px; margin: 30px 0 22px; }
    .today .counts dd { font-size: 36px; }
    .today .cta { width: auto; min-width: 320px; }
    .today .slab .row { max-width: 420px; }
    .today .mast { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); overflow: visible; margin: 0; padding: 0; }
    .today .mc { width: auto; transition: transform 200ms var(--ease), box-shadow 200ms; }
    .today .mc:hover { transform: translateY(-2px); box-shadow: 0 1px 0 rgba(21, 25, 54, 0.04), 0 16px 30px -14px rgba(21, 25, 54, 0.3); }
    .today .mtop { border-radius: 12px; }
    .today .mtop:hover .mn { text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1.5px; }
    .today .btn:not(:disabled):hover { filter: brightness(1.07); }
    .queue { margin-top: 16px; padding: 18px 20px 16px; }
    .qh { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
    .qbar { display: flex; gap: 3px; height: 10px; }
    .qbar i { border-radius: 4px; min-width: 6px; }
    .qleg { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 10px 0 6px; font-size: 13px; color: var(--ink-2); }
    .qleg span { display: inline-flex; align-items: center; gap: 6px; }
    .qleg i { width: 10px; height: 10px; border-radius: 3px; }
    .qleg b { color: var(--ink); }
    .k-line { background: var(--cobalt); } .k-new { background: var(--st-learning); } .k-punish { background: var(--good); } .k-danger { background: var(--bad); } .k-puzzle { background: var(--sun); } .k-mistake { background: #844bc6; } .k-drill { background: var(--ink-3); }
    .qlist { list-style: none; margin: 6px 0 0; padding: 0; }
    .qlist li { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 6px 0; border-top: 1px solid var(--ground); }
    .qn { flex: none; width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; background: var(--ground); font-size: 13px; color: var(--ink-2); }
    .qname { display: block; font-size: 17px; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qord { display: block; font-size: 12.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qk { flex: none; height: 24px; padding: 0 9px; border-radius: 8px; display: inline-grid; place-items: center; font-size: 12px; font-weight: 700; color: #fff; }
    .qk.k-puzzle { color: #3c2a0b; } .qk.k-new { color: #2f1d11; }
    .qmore { margin-top: 6px; }
  }
  @media (min-width: 1280px) and (min-height: 600px) {
    .today .hud { display: none; }
    .today { padding: 32px 40px 56px; }
  }
</style>
