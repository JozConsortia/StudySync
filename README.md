# StudySync

StudySync is an AI-powered study tool for **web, mobile and desktop**. A student uploads an exam paper (PDF or image), StudySync extracts every question with **OCR**, and **Google Gemini** produces the answer, a step-by-step solution, an explanation and exam tips. Students can also type a single question instead of uploading a paper. They can review, edit, save and download answers as PDF, and a **History** tab keeps every paper scanned and question asked, so they can search it, reopen it and keep solving.

## Project structure

```
StudySync/
├── database/schema.sql   MySQL schema: users, history, saved answers
├── server/               Python FastAPI backend (auth, OCR, Gemini AI)
├── web/                  React (Vite) web app
├── desktop/              Electron desktop app (wraps the web app)
└── mobile/               React Native (Expo) app for Android and iOS
```

### How it works

```
PDF / image ──► server ──► text-layer PDF? read text directly (PyMuPDF)
                       └─► scanned page or photo? RapidOCR (PP-OCR models on ONNX Runtime)
                       ──► Gemini splits the text into questions
student taps "Solve" ──► Gemini returns answer + steps + explanation + tips
```

### What the database stores

Students register with their name, email and password (hashed with bcrypt). Everything they do is linked to their account, so their history and saved answers follow them across web, desktop and mobile.

| Table | Holds |
| --- | --- |
| `users` | `id`, `full_name`, `email`, `password_hash`, timestamps |
| `history_sessions` | One row per scanned paper or typed question: `user_id`, title, subject, file name, OCR method, pages, created/updated time |
| `history_questions` | Each question in a session: number, text, marks and, once solved, `answer`, `steps` (JSON), `explanation`, `tips` (JSON) |
| `saved_answers` | Answers the student bookmarked with **Save**: `user_id`, paper title, question, marks and the full solution |

Every row is linked to `users.id` with a foreign key, so deleting a user deletes their history and saved answers too (`ON DELETE CASCADE`). Each user only ever sees their own data. History keeps the latest 100 sessions per user. Uploaded papers themselves are processed in memory and never stored.

The apps save changes in the background as students work: each solved question updates its history session, and Save or Remove updates `saved_answers`. If an older version of the app left history or saved answers in the browser or on the phone, they are uploaded to the student's account the first time they sign in, then removed from the device.

### Code and multi-line questions

Programming questions and anything where layout matters (code, pseudocode, program output, tables) are handled specially:

- **Reading the paper:** OCR and PDF extraction keep each line's indentation (rebuilt from where the line starts on the page), and the AI is told to repair any indentation the OCR got wrong.
- **Formatting on the server:** code is always put in a code block with its language, one statement per line, with clean 4-space indentation. The server does this itself (`server/app/services/codefmt.py`), so it works even when the AI forgets: it repairs line breaks that arrive escaped as `
`, lays out code squeezed onto one line, and snaps uneven indentation to whole levels.
- **Working, commented code:** the AI must return a complete solution with comments and an example run. Python code is compiled (never executed) to catch syntax errors; if it would not run, the AI is asked once to fix it. Code with too few comments (fewer than about one per three lines) has comments added by a second, narrow request, and the server checks that the code itself is unchanged before using it.
- **Display:** web, desktop and mobile show code in monospace blocks with comments highlighted and a Copy button, and PDF downloads keep the indentation. Students can paste code into a typed question; Tab indents in the question editors.

### StudySync Bot, themes and voice

- **StudySync Bot:** answers appear as chat messages from a robot assistant, with a "working it out" animation while it thinks. Typed questions are asked through the **Ask StudySync Bot** box.
- **Dark or bright mode:** use the sun / moon button in the top bar (or on the sign-in page). Dark is the default; the choice is remembered on each device.
- **Speak your question:** press **Speak**, ask your question, press **Stop**. In Chrome and Edge the browser recognises speech live. In the desktop app, other browsers and the phone apps, the recording is sent to `POST /api/papers/transcribe` and Gemini turns it into text (about 10-20 seconds). Recordings are WAV (web, iPhone) or AAC (Android), which Gemini accepts, and they are not stored.
- **Listen to the answer:** the **Listen** button reads the answer, steps, explanation and tips aloud with the device's own voice, saying maths naturally ("x squared") and pointing to the screen for code.

## 1. Requirements

- Python 3.11+ (backend)
- Node.js 20+ (web, desktop and mobile apps)
- MySQL 8+
- A Google Gemini API key (free tier available): https://aistudio.google.com/apikey
- For mobile: the **Expo Go** app on your phone, or an Android/iOS emulator

## 2. Install

```bash
npm install          # root helper (concurrently)
npm run install:all  # Python venv for server + web, desktop, mobile
```

The npm scripts for the server use Windows paths (`.venv\Scripts\python`). On macOS/Linux, set up the backend by hand:

```bash
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python init_db.py
.venv/bin/python run.py --reload
```

## 3. Configure the server

Edit `server/.env` (copy it from `server/.env.example` if it is missing):

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=studysync

JWT_SECRET=a_long_random_string
JWT_EXPIRES_DAYS=7
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=              # optional, defaults to gemini-flash-lite-latest
AI_TIMEOUT_SECONDS=120      # optional
```

## 4. Create the database

Either run the schema yourself:

```bash
mysql -u root -p < database/schema.sql
```

or let the server create it using the credentials in `server/.env`:

```bash
npm run db:init
```

`db:init` is safe to run again: it creates any missing tables and leaves existing data alone. To browse the data in MySQL Workbench, open the `studysync` schema and right-click a table → **Select Rows**.

## 5. Run

| App | Command | Notes |
| --- | --- | --- |
| API + web | `npm run dev` | API on http://localhost:5000, web on http://localhost:5173 |
| API only | `npm run server` | |
| Desktop | `npm run desktop` | Builds the web app, then opens it in Electron. The API must be running. |
| Desktop installer | `npm run desktop:dist` | Writes a Windows installer to `desktop/release/` |
| Mobile | `npm run mobile` | Scan the QR code with Expo Go. The API must be running. |

Check the API at http://localhost:5000/api/health. It reports whether MySQL and the Gemini key are configured. Interactive API docs (generated by FastAPI) are at http://localhost:5000/docs.

### Backend layout

```
server/
├── run.py              starts uvicorn on PORT (default 5000)
├── init_db.py          creates the database from database/schema.sql
├── requirements.txt
└── app/
    ├── main.py         FastAPI app, CORS, error handling, /api/health
    ├── config.py       reads server/.env
    ├── db.py           MySQL queries: users, history, saved answers
    ├── security.py     bcrypt password hashing + JWT
    ├── routes/auth.py  register, login, me
    ├── routes/papers.py extract (upload + OCR), solve
    ├── routes/history.py history sessions (list, save, delete, clear)
    ├── routes/saved.py saved answers (list, save, remove)
    ├── routes/schemas.py request validation and size limits
    └── services/
        ├── ocr.py      PyMuPDF + RapidOCR
        └── ai.py       Gemini prompts for splitting and solving
```

### Pointing the apps at the API

- **Web / desktop:** set `VITE_API_URL` in `web/.env` (default `http://localhost:5000`), then rebuild the desktop app.
- **Mobile:** in development the app uses the IP address of the computer running Expo, port 5000, so a phone on the same Wi-Fi works with no setup. To use another server, set `EXPO_PUBLIC_API_URL=http://<server-ip>:5000` in `mobile/.env`. The phone must be able to reach that address, so allow port 5000 through Windows Firewall if needed.

## API reference

Every route except register, login and health needs `Authorization: Bearer <token>`, and only reads or changes the signed-in user's own data.

| Method | Route | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{ fullName, email, password }` | `{ token, user }` |
| POST | `/api/auth/login` | `{ email, password }` | `{ token, user }` |
| GET | `/api/auth/me` | | `{ user }` |
| POST | `/api/papers/extract` | multipart `file` (PDF/PNG/JPG/WEBP/BMP/TIFF, max 20 MB) | `{ title, subject, questions[], rawText, method, pages }` |
| POST | `/api/papers/transcribe` | multipart `file` (WAV, AAC, MP3, OGG or FLAC, max 10 MB) | `{ text }` |
| POST | `/api/papers/solve` | `{ text, subject?, marks?, context? }` (context: earlier questions in the same section) | `{ answer, steps[], explanation, tips[] }` |
| GET | `/api/history` | | `{ history: [session with questions] }`, newest first |
| PUT | `/api/history/{id}` | `{ kind, title, subject, fileName, method, pages, createdAt, questions[] }` | 204. Creates or replaces that session |
| DELETE | `/api/history/{id}` | | 204 |
| DELETE | `/api/history` | | 204. Clears all of the user's history |
| GET | `/api/saved` | | `{ saved: [...] }`, newest first |
| POST | `/api/saved` | `{ id, paperTitle, subject, number, text, marks, solution }` | `{ saved }`. Saving the same `id` again updates it |
| DELETE | `/api/saved?key={id}` | | 204 |
| GET | `/api/health` | | `{ status, database, ai }` |

## Troubleshooting

- **"Database is unavailable"**: check `DB_*` in `server/.env` and that MySQL is running.
- **"missing a Google Gemini API key"**: set `GEMINI_API_KEY` in `server/.env` and restart the server.
- **"usage limit has been reached"**: the Gemini free tier allows a limited number of requests per minute and per day. Wait a minute (or until the next day), or enable billing in Google AI Studio for higher limits.
- **Answers are slow**: the default `gemini-flash-lite-latest` answers in a few seconds. Larger models such as `gemini-flash-latest` give similar results on exam questions but can take one to two minutes per answer on the free tier.
- **"model ... is not available"**: set `GEMINI_MODEL` in `server/.env` to a model your key can use (see https://ai.google.dev/gemini-api/docs/models).
- **First OCR request is slow**: RapidOCR loads its models on first use (and downloads them once if they are missing, which needs internet access). Later requests take a few seconds per page.
- **Poor OCR results**: use a flat, well-lit photo or a 300 dpi scan. Students can also tap the pencil icon on any question to fix OCR mistakes before solving.
- **Android release builds and `http://`**: Android blocks plain HTTP in release builds. Serve the API over HTTPS for production.
