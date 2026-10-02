import { defineConfig, devices, type Project } from '@playwright/test';

const requestedBrowser = process.env.PW_BROWSER;
const browserProject: Project = requestedBrowser === 'chrome'
    ? { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }
    : requestedBrowser === 'edge'
        ? { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } }
        : { name: 'chromium', use: { ...devices['Desktop Chrome'] } };

export default defineConfig({
    testDir: './e2e',
    timeout: 45_000,
    fullyParallel: false,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://127.0.0.1:3100',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [browserProject],
    webServer: [
        {
            command: 'DOTENV_CONFIG_PATH=.env.test node -r dotenv/config -r ts-node/register test/playwright-server.ts',
            cwd: '../backend',
            url: 'http://127.0.0.1:3099/api/health',
            reuseExistingServer: false,
            timeout: 120_000,
        },
        {
            command: 'NEXT_DIST_DIR=.next-playwright NEXT_PUBLIC_API_URL=http://127.0.0.1:3099/api npm run dev -- --hostname 127.0.0.1 --port 3100',
            cwd: '.',
            url: 'http://127.0.0.1:3100/login',
            reuseExistingServer: false,
            timeout: 120_000,
        },
    ],
});
