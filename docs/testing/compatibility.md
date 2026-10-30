# Compatibility and performance testing

Tests of the **deployed** system (web app https://dlovs-juba.netlify.app, API https://dlovs-api.onrender.com),
run on 30 Oct 2026. Proposal targets: NFR01 (record in under 3 s on 3G, payload under 50 KB), NFR06 (Chrome 90+,
Android 9+), NFR08 (WCAG 2.1 AA).

**Test machine:** Windows 11 Pro, Intel Core i5-13420H, 8 GB RAM, home Wi-Fi in Nairobi.

## 1. Browsers and simulated devices (Lighthouse 12)

Lighthouse's mobile mode emulates a low-end phone: a 412 × 823 screen, the CPU slowed 4×, and a slow 4G network
(150 ms round trip, about 1.6 Mbit/s). Desktop mode uses a fast desktop profile.

| Browser | Page | Device profile | Performance | Accessibility | Best practices | First paint | Largest paint | Page weight |
|---|---|---|---|---|---|---|---|---|
| Chrome 156 | Verify a parcel (search) | Low-end phone, slow 4G | 72 | 98 | 100 | 3.0 s | 3.0 s | 199 KB |
| Chrome 156 | Ownership record | Low-end phone, slow 4G | 64 | 100 | 100 | 3.6 s | 5.1 s | 200 KB |
| Edge 156 | Ownership record | Low-end phone, slow 4G | 57 | 100 | 100 | 3.4 s | 5.0 s | 200 KB |
| Chrome 156 | Verify a parcel (search) | Desktop | 76 | 98 | 100 | 2.1 s | 2.1 s | 199 KB |
| Chrome 156 | Ownership record | Desktop | 77 | 100 | 100 | 1.6 s | 2.2 s | 191 KB |

The whole page, scripts and styles included, is about **200 KB**, a quarter of a typical web page, and no map
tiles or images are loaded (FR18).

## 2. Screen sizes

| Screen | Browser | Result |
|---|---|---|
| Phone, 412 px (emulated) | Chrome | Header wraps onto two lines; cards fit; only the history table scrolls sideways inside its card. [Screenshot](emulated_phone_412px.jpg) |
| Tablet, 768 × 1024 | Chrome | Single column, no sideways scrolling. [Screenshot](chrome_768x1024_tablet.png) |
| Laptop, 1366 × 768 | Chrome / Edge | Two-column record, identical in both browsers. [Chrome](chrome_1366x768.png) · [Edge](edge_1366x768.png) |
| Full HD, 1920 × 1080 | Chrome | Content centred at a readable width. [Screenshot](chrome_1920x1080.png) |

A headless Chrome window can't be made narrower than about 500 px, so a "360 px" screenshot showed the page
clipped. The emulated 412 px phone above is the reliable small-screen test, and Lighthouse's viewport check passed.

## 3. Live API response times (from Nairobi to Render, Oregon, USA)

20 requests each, after the server was awake:

| Request | Median | 95th percentile | Response size |
|---|---|---|---|
| Verify a parcel (full record, history, disputes, documents) | 418 ms | 571 ms | 0.6 KB |
| Search by parcel ID | 421 ms | 725 ms | 0.2 KB |
| Search by owner name | 401 ms | 494 ms | 0.6 KB |
| Search by neighbourhood | 408 ms | 447 ms | 0.6 KB |
| Near me (500 m) | 394 ms | 463 ms | 0.7 KB |

The same requests take about 11 ms against a local server, so roughly 0.4 s is the network distance to the US
server. Every response is far under NFR01's 50 KB, and a record arrives well inside the 3-second target. On Render's
free tier the **first** request after 15 idle minutes takes up to about a minute while the server wakes.

## 4. Real devices

| Device | OS / browser | What was tested | Result |
|---|---|---|---|
| OPPO A54 5G (CPH2195), 4 GB RAM, 6.5 in | Android 13 (ColorOS 13), DLOVS APK | Install; scan genuine, fake and non-DLOVS QR codes; offline scan; search; Arabic | Works |
| OPPO A54 5G (CPH2195) | Android 13, Chrome for Android | Website: search, record, Arabic | Works |
| Laptop (above) | Windows 11, Chrome 156 and Edge 156 | Every page as guest, citizen, officer and administrator | Works |

## 5. Findings and improvements

| Finding | Effect | Change |
|---|---|---|
| The Google Fonts stylesheet blocked the first paint (Lighthouse estimated about 0.7 s) | Slower first paint, worst on slow networks | The font now loads without blocking: the page shows in the system font, then switches to Inter ([`web/index.html`](../../web/index.html)) |
| Netlify injects its own script and a "Powered by Netlify" badge: 11 KB, but about 0.8 s of processing on the emulated low-end phone | Nearly as costly as the whole app; the badge covers content on phones | Added by Netlify's free plan, not the app; hiding it requires a paid plan. Future work: a paid plan, or a host that doesn't inject a badge (e.g. Render's static sites), which would also move the web app next to the API |
| The app ships as one 134 KB JavaScript file for every page, about 1 s of processing on a low-end phone | Public visitors also download the staff pages | Future work: split the staff pages into a separate file loaded only after login |
| About 0.4 s of each request is distance to the US server | Slower than necessary for users in South Sudan | Future work: host the API and database in Render's Frankfurt region, the closest to East Africa |

### Before and after the font change

Same pages, browser and settings, one run each (Lighthouse scores vary by about ±10 points between runs):

| Page | Profile | Before: score / first paint | After: score / first paint | Render-blocking resources after |
|---|---|---|---|---|
| Verify a parcel | Low-end phone | 72 / 3.0 s | 77 / 3.5 s | None |
| Verify a parcel | Desktop | 76 / 2.1 s | 82 / 1.9 s | None |
| Ownership record | Low-end phone | 64 / 3.6 s | 60 / 3.8 s | None |
| Ownership record | Desktop | 77 / 1.6 s | 69 / 1.9 s | None |

The change removed the only render-blocking resource. The overall scores stayed within normal run-to-run variation,
because the remaining time goes to the JavaScript bundle, Netlify's injected script and the API round trip (above),
not the font.
