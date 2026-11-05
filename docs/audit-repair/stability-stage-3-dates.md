# Stage 3 independent historical-date correction

Teacher plan inputs omitted the selected cell date; the API additionally replaced rabt/muraja dates with server today. Capture the selected academic calendar date before queueing, send it for all three tasks and validate/store that date in the existing API. Missing calendar refuses the action instead of guessing today. Older clients omitting the field retain the existing server-date default. No old rows are rewritten or attributed to an assignment.

Acceptance: actual calendar generator returns historical week/day dates; both UI calls supply them; real API handlers on isolated SQLite store hifz/rabt/muraja dates and assignment identities, and invalid dates leave all completions unchanged. This does not complete stage 3: atomic grade+completion writes, request idempotency, safe assignment-scoped undo and preservation of old content versions remain required before stage acceptance/deployment.
