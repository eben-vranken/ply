import { chromium } from 'playwright';
import { preview } from 'vite';
const out = '/home/eben/ply/docs/screenshots/';
const server = await preview({ root: '/home/eben/ply/app', preview: { port: 4180 } });
const url = 'http://localhost:4180/ply/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await p.goto(url); await p.evaluate(() => { localStorage.setItem('ply-state-v1', JSON.stringify({ onboarded: true })); }); 
for (const [r, n] of [['today', '21-dark-today'], ['explore?side=w&p=e4%20e5%20Nf3%20Nc6%20Bc4', '22-dark-explore'], ['repertoire', '23-dark-repertoire'], ['stats', '24-dark-stats'], ['settings', '25-dark-settings']]) {
  await p.goto(url + '#/' + r); await p.reload(); await p.waitForTimeout(1200);
  if (n.includes('explore')) await p.evaluate(() => document.querySelector('.screen')?.scrollTo(0, 420));
  if (n.includes('settings')) await p.evaluate(() => document.querySelector('.screen')?.scrollTo(0, 900));
  await p.waitForTimeout(300); await p.screenshot({ path: out + n + '.png' }); console.log(n);
}
await b.close(); server.httpServer.close(); process.exit(0);
