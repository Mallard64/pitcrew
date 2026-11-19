# DevPad: pitch script

**problem** (big-statement): You fill a notebook with handwriting, then your iPad breaks. The notes are gone. Your notes should live in your account, not on one device.

**solution** (big-statement): DevPad is a notebook backend that saves typed and handwritten notes to each signed-in user's account.

**demo** (full-frame): This is DevPad's API running locally. Folders, notebooks, pages, cells and strokes each get their own endpoints.

**demo** (framed-zoom): Create Notebook takes a title, folder, cover color and template. Pages then hold code, text or ink cells.

**demo** (framed-zoom): Try it out makes the form live, so we can send a real request.

**demo** (framed-zoom): Execute sends it to the running server, with no sign-in token.

**demo** (framed-zoom): The server answers 401, not authenticated. Notebooks belong to a signed-in user: no token, no data.

**built** (diagram): The iPad app is written in Swift and signs in through Supabase. It sends tokens to a FastAPI backend, which stores data with SQLAlchemy in SQLite or Postgres.

**next** (bullet-reveal): Next: typed-note editing and free placement of cells, then images and attachments, search and offline sync.

**ask** (big-statement): Try it at github.com/yuchan-chung1964/DevPad

**end** (end-card): _(no narration)_
