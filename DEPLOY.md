# Project Passport — Deployment & Production Guide

This guide covers building, configuring, deploying, and verifying Project Passport in production.

---

## 1. Quickstart Commands (Windows PowerShell)

All operational scripts use standard `npm` and run in Windows PowerShell:

```powershell
# 1. Install dependencies
npm install

# 2. Run static analysis and linting
npm run typecheck
npm run lint

# 3. Run unit tests with Vitest
npm test

# 4. Build production distribution
npm run build

# 5. Preview production build locally (port 4173)
npm run preview

# 6. Run automated end-to-end tests with Playwright
npm run test:e2e
```

---

## 2. Static Hosting & SPA Routing Fallback

Project Passport is a 100% client-side, zero-backend single-page web application. It compiles to static files (`index.html`, JavaScript, CSS, web workers, fonts, and assets) in the `dist/` directory.

Because the app uses client-side routing (`/`, `/welcome`, `/privacy`, `/project/:id`), any HTTP server hosting it **must** redirect or rewrite all non-file route requests to `/index.html` with an HTTP 200 response.

### Generic Static Web Server (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name passport.example.com;

    root /var/www/project-passport/dist;
    index index.html;

    # SPA Fallback: serve matching file or directory, fallback to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none';" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;

    # Cache immutable hashed assets for 1 year
    location ~* \.(?:css|js|woff2?|png|svg|webmanifest)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Do NOT cache service worker or index.html
    location = /sw.js {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    location = /index.html {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

### Netlify

The repository includes `public/_headers` and `public/_redirects`. Netlify automatically processes both during deployment.

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **SPA Fallback (`public/_redirects`):**
  ```text
  /*    /index.html   200
  ```

### Cloudflare Pages

Cloudflare Pages respects `_headers` and `_redirects` placed in the build output root:

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- Cloudflare Pages will serve `dist/_headers` and `dist/_redirects` directly.

### Vercel

The repository includes `vercel.json` configuring client-side route rewrites and security headers:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none';"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "Referrer-Policy",
          "value": "no-referrer"
        }
      ]
    }
  ]
}
```

---

## 3. Headers, Content Security Policy (CSP) & HTTPS Requirement

### Content Security Policy Directives

The production CSP enforces the zero-leak invariant (`AGENTS.md §4.4`):

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
img-src 'self' data:;
connect-src 'self';
worker-src 'self' blob:;
object-src 'none';
base-uri 'none';
form-action 'self';
frame-ancestors 'none';
```

- `default-src 'self'`: Restricts all resources to the application's own origin by default.
- `connect-src 'self'`: Strictly prohibits any outbound HTTP, WebSocket, or fetch requests to third-party endpoints.
- `font-src 'self' data:`: Permits self-hosted fonts (`@fontsource/inter`, `@fontsource/jetbrains-mono`) and inline base64 font subsets.
- `worker-src 'self' blob:`: Permits module web workers (`parser.worker.ts`, `files.worker.ts`) and Dexie storage workers.
- `object-src 'none'`: Blocks Flash, Java applets, and legacy plugin embeddings.
- `base-uri 'none'`: Prevents `<base>` tag injection attacks.
- `frame-ancestors 'none'`: Enforces clickjacking prevention.

### HTTPS Requirement (Web Crypto)

The Web Crypto API (`window.crypto.subtle`) is used for:
1. Generating SHA-256 integrity fingerprints for checkpoints.
2. Generating file content hashes for handoff manifests (`MANIFEST.json`).
3. Verifying imported package archive signatures.

The browser security model restricts `crypto.subtle` exclusively to **Secure Contexts** (HTTPS or `http://localhost`).

> [!IMPORTANT]
> If deployed over plain HTTP without TLS, `detectCapabilities()` will detect that `crypto.subtle` is unavailable. The application will render an informative, non-crashing banner:
> *"Hashing in checkpoints and export needs a secure (HTTPS) connection."*
> Always deploy behind an SSL/TLS termination proxy (e.g. Let's Encrypt, Cloudflare, Netlify SSL).

---

## 4. Progressive Web App (PWA) Behavior

Project Passport ships with a full PWA service worker configured via `vite-plugin-pwa`:

### Precaching & Cache Strategy

- All static build output (HTML, CSS, JS chunks, worker files, self-hosted fonts, web manifest, and icons) is precached during service worker installation.
- Navigation requests fall back to `/index.html`.
- **Zero user data caching:** The service worker never caches user content, IndexedDB entries, or project files.

### Prompt-Style Updates & Autosave Flush Guard

The PWA updates using `registerType: 'prompt'`:
1. When an updated service worker is detected in the background, a non-blocking toast displays:
   *"A new version is ready"* with an actionable *"Reload"* button.
2. When the user clicks *"Reload"*, `pwaUpdater.ts` executes `flushActiveAutosave()` to persist any pending form drafts or changes.
3. If the autosave flush fails or has validation errors, the reload halts immediately and alerts the user to prevent data loss.
4. The application **never** reloads automatically without user consent.

### How to Verify Offline Functionality

1. Open the application in Google Chrome, Microsoft Edge, or Mozilla Firefox.
2. Open Browser DevTools (`F12`) and navigate to the **Application** (or **Storage**) tab.
3. Under **Service Workers**, confirm `sw.js` is active and running.
4. Switch to the **Network** tab and check the **Offline** checkbox (or disconnect your machine's Wi-Fi/Ethernet).
5. Reload the page (`Ctrl+R` / `Cmd+R`).
6. Observe that the app loads instantly offline, projects can be created and edited, and Lite export prompts can be generated without errors.

### How to Clear Service Worker & Site Data

To completely reset the application:
1. Open Browser DevTools (`F12`) > **Application** tab > **Storage**.
2. Click **Clear site data** (clears IndexedDB `ProjectPassportDB`, cache storage, service workers, and `localStorage.theme`).

---

## 5. How to Verify Zero Outbound Requests

Project Passport collects zero telemetry, zero analytics, and sends zero data off the client. You can verify this independently:

1. Open DevTools (`F12`) > **Network** tab.
2. Ensure the network filter is set to **All** or **Fetch/XHR**.
3. Create a project, edit the passport, paste a conversation, attach files, create a checkpoint, and export a full `.zip` bundle.
4. Inspect the Network log:
   - Notice that after the initial static bundle download, **no outbound network requests are made**.
   - All persistence occurs locally within IndexedDB database `ProjectPassportDB`.

---

## 6. Browser Compatibility & Minimum Versions

| Browser | Minimum Supported Version | Rationale |
| :--- | :--- | :--- |
| **Google Chrome** | 80+ | ES2020 modules, optional chaining, IndexedDB v2 |
| **Microsoft Edge** | 80+ | Chromium engine baseline parity |
| **Mozilla Firefox** | 78+ | Firefox ESR baseline with full Web Crypto support |
| **Apple Safari** | **16.4+** (macOS 13.3+, iOS 16.4+) | **Required for RegExp lookbehind assertions** |

### Note on Safari Lookbehind Regexes

The secret scanner engine (`src/domain/secretScanner.ts`) uses regular expressions with negative lookbehinds (e.g., `(?<![A-Za-z0-9_-])`) to accurately identify API keys, tokens, and private keys while preventing false positive substrings.

Full regular expression lookbehind support was introduced in **Safari 16.4** (released March 27, 2023). Earlier versions of Safari (Safari 15 and 16.0–16.3) cannot evaluate lookbehind assertions. Users on older Safari versions must update to iOS 16.4+ / macOS 13.3+ or use Chrome/Firefox.

---

## 7. Known Production Limitations

1. **Browser Storage Eviction & Quotas:**
   - Data is stored in client IndexedDB (`ProjectPassportDB`). While modern browsers permit several gigabytes of storage, private browsing sessions or low-disk-space conditions may subject storage to browser eviction policies.
   - Users are advised to periodically use the **Backup and restore** feature in the header to download a `.json` backup of all projects.
2. **Unbounded Checkpoint Growth:**
   - Checkpoints are append-only historical records. Projects with hundreds of snapshots and large attached files will consume proportional client disk space. Checkpoint pruning or archiving can be managed by the user.
3. **Folder Upload Compatibility:**
   - Folder selection (`webkitdirectory`) is supported on modern desktop browsers (Chrome, Edge, Firefox, Safari). On mobile browsers where folder pickers are unavailable, the app gracefully falls back to multi-file selection or `.zip` upload.
