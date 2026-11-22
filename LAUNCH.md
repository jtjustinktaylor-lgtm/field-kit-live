# Launch Field Kit as a shared pilot

## Set up the shared site

1. Deploy this repository via its Render Blueprint. The service uses a paid Starter instance and a 1 GB persistent disk. Review the current charge in Render before creating the service. Keep one instance while using SQLite. The Dockerfile is an alternative for another provider.
2. After it deploys, open the assigned HTTPS URL and check `/api/status` returns `{"shared":true}`. Retrieve the generated `PILOT_ACCESS_CODE` from the host's environment settings and share it only with invited organizers. Participants never need the code.
3. Create one sample workspace per product. Record the private manager link separately. Open the public links on a second phone and complete a claim, checkout and event update. Delete the sample workspaces when done.
4. Before adding real participants, agree on how long to keep booking and return records. Use the manager controls to delete completed listings, remove waitlist contacts and clear gear return history. Configure backups for the SQLite disk and test recovery. Point any custom domain at the service and set `PUBLIC_ORIGIN` to its exact HTTPS origin.

Waitlist messages are drafted in the organizer’s email app for review. Nothing is sent automatically. Payment is handled directly between the business and customer. There is no billing, staff account, or lost-link recovery in this release.

## First three offers

| Product | First customer | Pilot offer | What would earn a renewal |
| --- | --- | --- | --- |
| LastSlot | A hair or nail studio with regular cancellations | Put their public booking link on their social profile for two weeks. | Fill appointments that would have gone empty. Try $19 CAD/month after demonstrating a recovery. |
| BorrowBoard | Club, school, or makerspace with at least 20 loaner items | Import and label their gear; try it for two weeks. | Reduce late returns and time spent tracking gear. Try $25 CAD/month per gear room. |
| RainPlan | A league or program with last-minute changes | Give one coordinator a page for all events for a month. | Fewer duplicate messages and fewer arrivals at the wrong location. Try $29 CAD per season per program. |

Prices are starting points to test. Measure one outcome per pilot before buying ads or building automatic billing.

## Copy you can post

**LastSlot:** Got a cancellation today? Post the service and time on your LastSlot page. Share it once and let the first eligible customer claim it. We’re looking for hair and nail studios to try it with their next opening.

**BorrowBoard:** Who borrowed the gear? Scan a label to check an item out, see when it’s due and mark it back in. Try it on your club’s next 20 items.

**RainPlan:** Send the program link once. Families can check where an event is happening, what time it starts and what changed.
