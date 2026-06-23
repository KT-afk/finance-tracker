# Phone Access Runbook

Use this when you want to modify Finance Tracker from your phone.

## Choose the Access Mode

- **Mac online:** use Tailscale private access. The app runs on your Mac and your phone reaches it through your tailnet.
- **Mac offline:** use the hosted path in `docs/vercel-turso-runbook.md`. The app runs on Vercel or another Node host, and data lives in Turso/libSQL.

Both remote modes require `APP_PASSWORD`. Hosted/cloud modes fail closed without it.

## Tailscale Setup

Install Tailscale on the Mac and phone, then sign in to the same tailnet.

```bash
npm run phone:configure
npm run phone:setup-service
npm run phone:diagnose
npm run phone:preflight
```

If `npm run phone:diagnose` reports `Failed to load preferences`, open or restart the Tailscale macOS app and sign in. If the app shows this Mac's `100.x.y.z` address but the CLI still fails, configure with that address manually:

```bash
read -s APP_PASSWORD
APP_PASSWORD="$APP_PASSWORD" FINANCE_TRACKER_HOSTNAME=100.x.y.z npm run phone:configure
```

Then rerun:

```bash
npm run phone:setup-service
npm run phone:preflight
```

## Final Phone Check

Open the printed private URL on your phone while Tailscale is connected. Log in with `APP_PASSWORD`, create a small manual transaction, refresh, then delete it. The goal is only complete once this real phone check works.
