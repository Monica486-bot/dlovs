# DLOVS mobile app

React Native (Expo SDK 57, Expo Router) app for the public and citizens: scan a plot marker's QR code, search the
register, and manage your own parcels. Officer and administrator tools are in the web app.

## Run it

```bash
npm install
cp .env.example .env        # EXPO_PUBLIC_API_URL, see below
npx expo start              # scan the QR code in the terminal with Expo Go
```

`EXPO_PUBLIC_API_URL` must be reachable from the phone:

| Where the app runs | Value |
|---|---|
| Android emulator | `http://10.0.2.2:4000/api` |
| Phone on the same Wi-Fi as your computer | `http://<your computer's LAN IP>:4000/api` |
| Field testing | `https://<your-service>.onrender.com/api` |

## Screens

The four main screens are tabs (`src/app/(tabs)/`): **Home**, **Search**, **Saved** and **Account**. The others open on top of them.

| Screen | Requirement |
|---|---|
| Home (`(tabs)/index.js`) | Scan card, search and saved tiles, the citizen's own land and notifications |
| Scan (`scan.tsx`) | FR06 pathway 1: reads the QR code and checks its Ed25519 signature on the phone, offline too |
| Search (`(tabs)/search.js`) | FR06 pathways 2–4: parcel ID, owner, area, national ID, *Near me* (GPS); FR17 filters; FR13 report on no results |
| Ownership Record (`parcel/[id].js`) | FR07, FR08; QR genuine / replaced / forged; FR04 10 m location badge; FR16 offline copy |
| Owner Portfolio (`owner/[id].js`) | FR09 |
| Saved (`(tabs)/recent.js`) | FR16: last 50 records, available offline |
| My Parcels, My Parcel (`mine.js`, `my-parcel/[id].js`) | Own parcels; FR10 document upload; transfer request |
| Flag a Dispute (`dispute.js`) | FR12 |
| Report a Plot (`report-plot.js`) | FR13 |
| Notifications (`notifications.js`) | FR15 |
| Account (`(tabs)/account.js`) | National ID, language (FR19) |
| Log In, Create Account, Confirm Phone, Reset Password | FR01, FR20 |

Every screen is in English and Arabic (right-to-left). Switch language from the button in the header.

## Push notifications (FR15)

Push needs an Expo project and a real build. **Expo Go on Android no longer supports push**. Without them the app
works the same, and notifications appear in the Notifications screen and by SMS.

1. `npm install -g eas-cli`, then `eas login` with your (free) Expo account.
2. `eas init`: creates the project and writes its ID into `app.json` (`expo.extra.eas.projectId`). The app reads it
   to get a push token.
3. For Android push, Expo needs Firebase Cloud Messaging credentials: follow
   https://docs.expo.dev/push-notifications/fcm-credentials/ (free).
4. Build and install the APK (below). After logging in, the app asks for notification permission and registers the
   phone with the API (`POST /api/push-tokens`). Logging out removes it.

## Build the APK for test phones

```bash
eas build -p android --profile preview
```

Set `EXPO_PUBLIC_API_URL` to the deployed API first (in `.env`, or as an EAS environment variable). The build page
gives a link to download the APK; install it directly on the phones, no app store needed.
