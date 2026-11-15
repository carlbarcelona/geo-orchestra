import { Config } from '@remotion/cli/config';

// Use the Chromium already cached by Playwright instead of downloading another browser.
Config.setBrowserExecutable(`${process.env.LOCALAPPDATA}/ms-playwright/chromium-1243/chrome-win64/chrome.exe`);
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
