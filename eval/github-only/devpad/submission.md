## DevPad

**What it is.** A notebook backend and iPad client for typed and handwritten notes. Folders, notebooks, pages and cells (code, text or ink) are stored per signed-in user.

**Problem.** Handwritten notes tied to a single device are hard to keep and move.

**How it works.** A FastAPI and SQLAlchemy backend verifies Supabase JWT sign-ins, keeps each user's data separate, and applies rate and size limits. It runs on SQLite by default and has passed a 53-check smoke test on Supabase Postgres. The Swift iOS client is written but has not been compiled yet.

**What's next.** Typed-note editing, free placement of cells with migrations, then images and attachments, search and offline sync. Deployment on Render is also planned.