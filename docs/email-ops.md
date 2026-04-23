# Email Operations for Settlement Reminders

The internal backend uses a customized background job worker architecture to send email notifications without holding up critical HTTP requests. It separates the presentation (template strings) from the logical workflow (job queueing).

## Configuration
By default, the worker will run in a **dry-run** logging mode to provide transparent observability during local development and CI test runs. It seamlessly switches to a production-grade SMTP pool when credentials are provided in the environment variables (e.g., via `.env`).

Required environment variables for real traffic:
- `SMTP_HOST`: The host for your SMTP delivery service (e.g., SendGrid, AWS SES).
- `SMTP_PORT`: (Optional) Defaults to 587.
- `SMTP_USER`: SMTP authenticated username.
- `SMTP_PASS`: SMTP authenticated password.
- `SMTP_FROM`: (Optional) Sender signature overriding `noreply@liquifact.com`.

## Memory Footprint of the Invoice Map
Our job execution manages `cancellable jobs`. E.g., if an invoice is settled well before the maturity date, we should refrain from bothering the end-user with a reminder. We achieve this with a localized map mapping `invoiceId`s to `jobId`s.
The localized map does not pose a significant memory constraint since successful deliveries cleanly evict mapped keys, keeping state extremely lightweight. 

## Code Interactions

### `scheduleReminder(invoice, targetDate, email)`
Schedules the async delivery to the particular email at `targetDate` using our exponential backoff job queue underneath.
It handles deduplication seamlessly: re-scheduling a reminder manually drops the old intent from the queue instantly.

### `cancelReminder(invoiceId)`
A straightforward utility for the Express controller. Pass the invoice ID if the invoice is successfully settled entirely, which prunes it off the BackgroundWorker's waiting block.

## Testing manually using Node.js REPL

You can test this easily manually without triggering full test suites:
```javascript
const {
  scheduleReminder,
  startQueueProcessing,
  templates
} = require('./src/jobs/maturityReminders');

startQueueProcessing();

const simulatedInvoice = { id: 'test_123', customer: 'Alice', amount: 50 };
// Schedules immediately (since it's in the past)
scheduleReminder(simulatedInvoice, new Date(), 'alice@example.com');
```
