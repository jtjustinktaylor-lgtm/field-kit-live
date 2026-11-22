# Field Kit

Three shared pilot apps from Open Tools Studio.

- **LastSlot:** Give a business one booking page where customers claim open appointments. The private dashboard handles openings and an opt-in waitlist, with suggested email drafts for matching services. No automatic messages or payments.
- **BorrowBoard:** Import inventory, download QR labels, check items out, and record returns. Organizers can search by availability, see overdue gear, and download a private return log.
- **RainPlan:** Publish a program page for all upcoming events. Each event can show delays, venue changes, cancellations, and a pinned announcement.

[Try the browser preview](https://jtjustinktaylor-lgtm.github.io/open-tools-lab/field-kit/?v=3). Preview activity stays in that browser.

## Run the shared app

Use Node 24 or later. Run `npm test`, then `npm start` and open http://127.0.0.1:8433/. The shared app saves boards in SQLite and separates public links, private manager links, and private receipts. No install step.

[Deploy to Render](https://render.com/deploy?repo=https://github.com/jtjustinktaylor-lgtm/field-kit-live) with HTTPS and a persistent disk, or use the included Dockerfile with a persistent volume at `/app/data`. The Render Blueprint creates a paid Starter service and a 1 GB disk. Keep one instance while using SQLite. Set `PUBLIC_ORIGIN` to the exact HTTPS origin if using your own domain or another host.

Set `PILOT_ACCESS_CODE` to limit the creation of workspaces to invited organizers (the Render Blueprint generates it). Participants never need the code. Save manager links privately: account recovery is not part of this pilot.

See [the launch checklist and suggested pilot pricing](LAUNCH.md) and [future product direction](ROADMAP.md). The QR generator is vendored under its original license in `public/qr-license.txt`.
