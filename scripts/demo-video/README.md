# TechOdos demo video — how to re-record

Records the real running site (customer ordering → admin/kitchen handling the same order) and edits it into MP4s.

1. Build + start an isolated copy of the app with notifications off (port 3100):
   ```bash
   NEXT_DIST_DIR=.next-demo NEXT_PUBLIC_SITE_URL=http://localhost:3100 NEXT_PUBLIC_FIREBASE_API_KEY= NEXT_PUBLIC_FIREBASE_PROJECT_ID= NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID= NEXT_PUBLIC_FIREBASE_APP_ID= NEXT_PUBLIC_FIREBASE_VAPID_KEY= npx next build
   git checkout tsconfig.json   # next build adds .next-demo to it
   NEXT_DIST_DIR=.next-demo NEXT_PUBLIC_SITE_URL=http://localhost:3100 RESEND_API_KEY= FCM_PROJECT_ID= FCM_CLIENT_EMAIL= FCM_PRIVATE_KEY= npx next start -p 3100
   ```
2. Record (logins only via env; typed off-camera into masked fields; `DEMO_REDACT` masks real values on screen only):
   ```bash
   DEMO_BASE_URL=http://localhost:3100 DEMO_CUSTOMER_EMAIL=... DEMO_CUSTOMER_PASSWORD=... DEMO_ADMIN_EMAIL=... DEMO_ADMIN_PASSWORD=... \
   DEMO_REDACT="<real phone digits>=>3001234567" npx tsx scripts/demo-video/record.ts demo-video-out/recording
   ```
   Optional: `DEMO_AREA` (default Walton), `DEMO_BRANCH` (switch admin branch on camera), `DEMO_DINER_NAME/PHONE/ADDRESS`.
3. Music + edit (needs FFmpeg on PATH or `FFMPEG=/path/to/ffmpeg`):
   ```bash
   npx tsx scripts/demo-video/music.ts demo-video-out/music.wav 190
   npx tsx scripts/demo-video/assemble.ts demo-video-out/recording demo-video-out/TechOdos-Demo-Full-1080p.mp4 demo-video-out/music.wav
   npx tsx scripts/demo-video/assemble.ts demo-video-out/recording demo-video-out/TechOdos-Promo-Short-1080p.mp4 demo-video-out/music.wav promo-ranges.json
   ```
   `promo-ranges.json` = `[[startMark, endMark], ...]` (mark names from `recording/timeline.json`, or seconds).
4. Cancel the demo order afterwards: `npx tsx scripts/demo-video/cleanup.ts <ORDER-NO>` (same env logins).

Files: `recorder.ts` (screencast capture, cursor/captions overlay, display masking), `record.ts` (the storyboard + captions),
`cards.ts` (intro/chapter/CTA cards — edit brand/contact here), `music.ts` (original generated track), `assemble.ts` (FFmpeg),
`cleanup.ts`, `explore.ts`/`scout-admin.ts`/`step.ts` (scouting helpers).
