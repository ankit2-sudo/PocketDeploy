# PocketDeploy

> Render.com in your pocket. Deploy apps directly from your Android phone.

PocketDeploy is a mobile-first application hosting platform that runs entirely on your Android device. Host up to 10 apps directly from your phone by simply pasting a GitHub repo URL.

## Features

- Paste a GitHub/GitLab repo URL and your app is live in minutes
- Auto-detects project type (Node.js, Python, Go, etc.)
- Assigns each app a persistent public URL via Cloudflare Tunnel
- Manages up to 10 concurrent running applications
- Auto-redeploys on every git push via GitHub webhooks
- Real-time logs, process status, start/stop/restart controls
- Zero external dependencies — completely self-contained

## Tech Stack

- **Mobile App:** React Native (Expo bare workflow), TypeScript, NativeWind, Zustand
- **Core Engine:** Node.js daemon with Express.js, PM2, better-sqlite3
- **Bundled Binaries:** Node.js, git, Python3, cloudflared (ARM64)
- **Tunneling:** Cloudflare Quick Tunnels

## Getting Started

1. Clone this repo
2. Run `npm install`
3. Place ARM64 binaries in `android/app/src/main/assets/binaries.zip`
4. Run `npx react-native run-android`

## Architecture

See [Architecture Documentation](docs/ARCHITECTURE.md) for full system design.

## License

MIT
