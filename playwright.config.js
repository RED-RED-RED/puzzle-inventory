// Browser tests: npm run test:ui
// Starts its own copy of the app on port 3100 with throwaway data.
const { defineConfig } = require('@playwright/test');

const PORT = 3100;

module.exports = defineConfig({
    testDir: './tests/ui',
    workers: 1,              // the tests share one app instance
    fullyParallel: false,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        timezoneId: 'America/Chicago',   // catches "date shows a day early" bugs
        locale: 'en-US',
        trace: 'retain-on-failure',
        // Use a locally installed Chrome when CHROME_PATH is set
        launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
    },
    webServer: {
        command: 'node tests/start-server.js',
        url: `http://127.0.0.1:${PORT}/api/health`,
        env: { PORT: String(PORT) },
        reuseExistingServer: false,
        timeout: 30000,
        // Stop it with SIGTERM so it removes its temporary data folder
        gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 }
    }
});
