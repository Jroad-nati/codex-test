# Little List

A beginner-friendly todo app built with Vue 3's Composition API, JavaScript, Vite, and plain CSS.

## Run locally

Use Node.js 22.12 or later (Node 24 is recommended).

```sh
npm ci
npm run dev
```

Open the address printed by Vite.

```sh
npm test       # Vitest + Vue Test Utils; requests are mocked
npm run build # Create the production site in dist/
npm run preview # Serve the production build locally
```

## How it works

`src/App.vue` holds the task list, form, filters, and API functions. Vue's `ref` stores changing values; `computed` derives the visible tasks and remaining count. `src/style.css` contains the responsive styles. Tests are in `src/tests/App.test.js`.

On the first visit, the app loads sample tasks from `GET https://dummyjson.com/todos/user/1`. Adding uses `POST /todos/add`; existing sample tasks use `PUT /todos/{id}` for completion and `DELETE /todos/{id}` for deletion. Failed requests leave the list unchanged and offer a retry. Empty submissions and duplicate requests are blocked.

DummyJSON simulates changes and does not persist them. After successful changes, this app saves the entire list under `little-list-tasks-v1` in localStorage and restores it after refresh, including an empty list. New tasks receive unique `local-` IDs using `crypto.randomUUID()` instead of the API's pretend IDs. Subsequent updates and deletions for these tasks happen locally, without API calls. Use HTTPS or localhost for the app.

**Storage belongs to this browser and this site's origin on this device.** It does not sync across browsers or devices. Clearing site data removes the list; the next visit loads fresh sample tasks. Avoid storing sensitive information in tasks. If storage is unavailable or full, the app displays a warning.

## Production hosting

Run `npm ci && npm run build`, then serve the `dist/` directory as a static site over HTTPS. There are no server secrets or backend services. The browser needs access to `https://dummyjson.com`. This project does not include a ChatGPT Sites deployment because Sites is unavailable in the current tool session.
