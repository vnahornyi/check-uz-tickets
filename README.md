# check-uz-tickets

Minimal instructions to install and run this project.

Prerequisites
- Node.js (v18 or newer recommended)
- npm (comes with Node.js)

Install
1. Install dependencies:

	npm install

2. Install Playwright browsers (required for Playwright to run):

	npx playwright install

Run
- Start the app:

  npm start

  or

  node index.mjs

Notes
- The project uses Playwright (see `package.json`). Ensure the browsers are installed with `npx playwright install` before running.
- If you run into permission or dependency issues on some platforms, try `npx playwright install --with-deps`.

Replace monitored URL
- Open the file `index.mjs` and replace the value of the `URL` constant near the top of the file with the page you want to monitor. For example:

  const URL = "https://booking.uz.gov.ua/search-trips/FROM/TO/list?startDate=YYYY-MM-DD";

- The current default URL is set for demonstration; update it before running the watcher.

If you want, I can add more details (environment variables, example usage, or a `start` script tweak).
