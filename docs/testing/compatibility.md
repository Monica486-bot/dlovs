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
| _Android phone model_ | _Android version_, DLOVS APK | Install; scan genuine, fake and non-DLOVS QR codes; offline scan; search; Arabic | |
| _Android phone model_ | Chrome for Android | Website: search, record, Arabic | |
| _iPhone model_ | _iOS version_, Safari | Website: search, record; scan a marker with the Camera app | |
| Laptop (above) | Windows 11, Chrome 156 and Edge 156 | Every page as guest, citizen, officer and administrator | Works |

## 5. Findings and improvements

| Finding | Effect | Change |
|---|---|---|
| The Google Fonts stylesheet blocked the first paint (Lighthouse: about 0.7 s) | Slower first paint, worst on slow networks | The font now loads without blocking: the page shows in the system font first, then switches to Inter ([`web/index.html`](../../web/index.html)) |
| Netlify injects its own script and a "Powered by Netlify" badge | Extra download; the badge covers content on phones | Comes from Netlify, not the app; can be switched off in the Netlify site settings |
| About 0.4 s of each request is distance to the US server | Slower than necessary for users in South Sudan | Future work: host the API and database in Render's Frankfurt region, the closest to East Africa |
