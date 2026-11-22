# Deploy Field Kit on Cloudflare Free

[Open the Cloudflare deploy wizard](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fjtjustinktaylor-lgtm%2Ffield-kit-live). Sign into your Cloudflare account, connect GitHub if prompted, and keep Workers on Free. The wizard clones the source into your GitHub account and sets up a D1 database; the deploy command runs the database migration. Review the install and deploy settings before confirming. No custom domain is needed.

Give `PILOT_ACCESS_CODE` a long random value in the secret field (or set it after deploy in **Workers & Pages → your Worker → Settings → Variables and Secrets**). Enter it privately when creating workspaces. Customers and participants only need their public link. Existing workspaces remain usable if organizer signup is disabled. Keep the manager links somewhere private.

Open the new `workers.dev` site, publish a test workspace, and open the same public link on a second phone. Test a claim, checkout or event update before sharing with real participants. Waitlist emails are still drafted manually; the pilot does not collect payments. The older Render plan is a paid alternative and is not needed for Cloudflare.

## CLI alternative

Use Node 24, then `npm install` and `npx wrangler login`. Create the D1 database with `npx wrangler d1 create field-kit`; put its ID in the `DB` entry of `wrangler.jsonc`. Run `npm run deploy` and `npx wrangler secret put PILOT_ACCESS_CODE`. Double-check the resulting URL and the deployed environment.

To test the Worker locally, run `npx wrangler d1 migrations apply DB --local` and `npm run cf:dev -- --var PILOT_ACCESS_CODE:local-test-only`. In another terminal, run `FIELD_KIT_TEST_URL=http://127.0.0.1:8787 FIELD_KIT_TEST_CODE=local-test-only npm run cf:test`.

Watch [Workers requests](https://developers.cloudflare.com/workers/platform/limits/) and [D1 database usage](https://developers.cloudflare.com/d1/platform/pricing/) before changing plans. On Free, the APIs can stop responding if a daily limit is reached. This pilot does not need a paid tier at initial volume; move up once usage calls for it.
