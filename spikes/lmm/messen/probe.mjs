import { pathToFileURL } from 'node:url';
const R = '/home/user/dokufix/';
const { chromium } = await import(R + 'node_modules/playwright-core/index.mjs');
const { prepareLibraries } = await import(R + 'tests/cdn.mjs');
const libraries = await prepareLibraries(R + 'dist/dokufix.html');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  const context = await browser.newContext(); await libraries.serve(context);
  const page = await context.newPage();
  await page.goto(pathToFileURL(R + 'dist/dokufix.html').href);
  await page.waitForFunction(() => !!document.querySelector('#dokufix-rail.has-items'), null, { timeout: 90000 });
  const out = await page.evaluate(() => {
    const before = new Set(document.body.children);
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;width:4000px;height:3000px'; document.body.appendChild(host);
    const v = new BpmnJS({ container: host });
    const services = []; try { v.get('canvas'); services.push('canvas'); } catch {}
    const tr = v.get('textRenderer');
    const m1 = tr.getExternalLabelBounds({ x: 0, y: 0, width: 90, height: 30 }, 'Antrag prüfen und weiterleiten');
    const added = [...document.body.children].filter(e => !before.has(e) && e !== host).map(e => e.tagName + (e.id ? '#' + e.id : '') + '.' + (e.getAttribute('class') || ''));
    const inHost = host.querySelectorAll('svg').length;
    v.destroy(); host.remove();
    let after = null; try { after = tr.getExternalLabelBounds({ x: 0, y: 0, width: 90, height: 30 }, 'Antrag prüfen und weiterleiten'); } catch (e) { after = 'Fehler: ' + e.message; }
    return { m1, added, inHost, after, proto: Object.getOwnPropertyNames(Object.getPrototypeOf(tr)).concat(Object.keys(tr)).filter(k => typeof tr[k] === 'function') };
  });
  console.log(JSON.stringify(out, null, 1));
} finally { await browser.close(); }
