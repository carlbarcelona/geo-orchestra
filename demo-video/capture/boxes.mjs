// Measures where the UI elements the video points at sit on the 1920×1080 capture (same state as capture.mjs).
// Writes src/boxes.json: { name: [x, y, w, h] }.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const exe = `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1243/chrome-win64/chrome.exe`;
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript(() => { localStorage.setItem('geoorchestra:uiMode', 'advanced'); localStorage.setItem('geoorchestra:theme', 'dark'); });
await page.goto(process.env.APP_URL ?? 'http://localhost:4317/');
const ctl = (name) => page.getByRole('tab', { name, exact: true }).or(page.getByRole('button', { name, exact: true })).first();
const box = async (loc) => { const b = await loc.first().boundingBox(); return b ? [b.x, b.y, b.width, b.height].map(Math.round) : null; };
const out = {};
await page.getByRole('button', { name: 'NASA sample' }).first().click();
await page.getByText('295 months').first().waitFor();
await ctl('Graph').click();
await page.waitForTimeout(800);
out.caption = await box(page.getByText('Now hearing', { exact: false }).locator('xpath=..'));
out.pianoRoll = await box(page.locator('canvas').filter({ visible: true }).last());
out.graph = await box(page.locator('svg.graph'));
out.modeTabs = await box(page.getByRole('tablist', { name: 'Sound mode' }));
out.geophonyTab = await box(ctl('Geophony'));
out.melodyChip = await box(page.locator('.mute-chip', { hasText: 'Melody' }));
out.chips = await box(page.locator('.element-mutes'));
out.soundPanel = await box(page.locator('section.panel').filter({ has: page.getByRole('tablist', { name: 'Sound mode' }) }));
await ctl('Visual feed').click();
await page.getByRole('button', { name: 'Import visual feed' }).first().click();
await page.getByRole('button', { name: 'Connect climatology' }).first().waitFor();
await page.getByRole('button', { name: 'Connect climatology' }).first().click();
await page.getByRole('button', { name: 'Disconnect' }).first().waitFor();
await page.waitForTimeout(1500);
out.frame = await box(page.locator('.frame-wrap img').first());
out.frameScore = await box(page.locator('canvas').filter({ visible: true }).last());
out.sweepButton = await box(ctl('Sweep frame'));
writeFileSync('src/boxes.json', JSON.stringify(out, null, 1));
console.log(out);
await browser.close();
