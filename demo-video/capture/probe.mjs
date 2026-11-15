// Lists the buttons and tabs visible at each step of the demo path, to script the capture against real labels.
import { chromium } from 'playwright';

const exe = `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1243/chrome-win64/chrome.exe`;
const URL = process.env.APP_URL ?? 'http://localhost:4317/';
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript(() => { localStorage.setItem('geoorchestra:uiMode', 'advanced'); localStorage.setItem('geoorchestra:theme', 'dark'); });
await page.goto(URL);
const dump = async (label) => {
  const names = await page.$$eval('button, [role=tab], select', (els) => els.filter((e) => e.offsetParent).map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)));
  console.log(`\n## ${label}\n${[...new Set(names)].join(' | ')}`);
};
await page.waitForTimeout(1500);
await dump('start');
for (const step of (process.argv[2] ?? '').split(',').filter(Boolean)) {
  await page.getByRole('button', { name: step, exact: false }).first().click().catch(() => page.getByText(step, { exact: false }).first().click());
  await page.waitForTimeout(2500);
  await dump(`after "${step}"`);
}
await page.screenshot({ path: 'capture/probe.png' });
await browser.close();
