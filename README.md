# StudySync

StudySync is an AI-powered study tool for **web, mobile and desktop**. A student uploads an exam paper (PDF or image), StudySync extracts every question with **RapidOCR**, and **Google Gemini** produces the answer, a step-by-step solution, an explanation and exam tips. Students can then ask **follow-up questions** about any answer, and keep sharp with **daily challenges** that are marked, rated and build a streak. Students can also type a single question instead of uploading a paper. They can review, edit, save and download answers as PDF, and a **History** tab keeps every paper scanned and question asked, so they can search it, reopen it and keep solving.

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
PDF / image ──► server ──► scanned page or photo? RapidOCR (PP-OCR models on ONNX Runtime)
                       └─► text-layer PDF? read text directly (PyMuPDF), unless OCR_MODE=rapidocr
                       ──► Gemini splits the text into questions
student taps "Solve" ──► Gemini returns answer + steps + explanation + tips
student asks a follow-up ──► Gemini answers using the question, the solution and the chat so far
```

**OCR engine:** text recognition is done by [RapidOCR](https://github.com/RapidAI/RapidOCR), which runs the PP-OCR models on ONNX Runtime with no system install. The server loads the models when it starts, so the first upload is not slowed down. `OCR_MODE` in `server/.env` chooses how PDFs are read:

| `OCR_MODE` | Behaviour |
| --- | --- |
| `auto` (default) | PDF pages that already contain text are read directly, which is exact and fast; scanned pages and photos go through RapidOCR. |
| `rapidocr` | Every page, including text PDFs, goes through RapidOCR. |

The paper's chips show how it was read: **RapidOCR**, **Text PDF** or **Text PDF + RapidOCR**.

### What the database stores

Students register with their name, email and password (hashed with bcrypt). Everything they do is linked to their account, so their history and saved answers follow them across web, desktop and mobile.

| Table | Holds |
| --- | --- |
| `users` | `id`, `full_name`, `email`, `password_hash`, timestamps |
| `history_sessions` | One row per scanned paper or typed question: `user_id`, title, subject, file name, OCR method, pages, created/updated time |
| `history_questions` | Each question in a session: number, text, marks and, once solved, `answer`, `steps` (JSON), `explanation`, `tips` (JSON) and `followups` (JSON: the student's follow-up questions and the bot's replies) |
| `saved_answers` | Answers the student bookmarked with **Save**: `user_id`, paper title, question, marks, the full solution and its follow-ups |
| `password_resets` | One active "Forgot password" code per user: a keyed hash of the code (never the code itself), expiry time and wrong-attempt count |
| `daily_challenges` | One row per user per day: the challenges (with answers, which the apps only receive after answering), the student's results, the day's score and when it was completed |

Every row is linked to `users.id` with a foreign key, so deleting a user deletes their history and saved answers too (`ON DELETE CASCADE`). Each user only ever sees their own data. History keeps the latest 100 sessions per user. Uploaded papers themselves are processed in memory and never stored.

Tables and columns added in later versions (such as `followups`, `password_resets` and `daily_challenges`) are added to an existing database automatically when the server starts, or by `npm run db:init`.

The apps save changes in the background as students work: each solved question updates its history session, and Save or Remove updates `saved_answers`. If an older version of the app left history or saved answers in the browser or on the phone, they are uploaded to the student's account the first time they sign in, then removed from the device.

### Code and multi-line questions

Programming questions and anything where layout matters (code, pseudocode, program output, tables) are handled specially:

- **Reading the paper:** OCR and PDF extraction keep each line's indentation (rebuilt from where the line starts on the page), and the AI is told to repair any indentation the OCR got wrong.
- **Formatting on the server:** code is always put in a code block with its language, one statement per line, with clean 4-space indentation. The server does this itself (`server/app/services/codefmt.py`), so it works even when the AI forgets: it repairs line breaks that arrive escaped as `\n`, lays out code squeezed onto one line, and snaps uneven indentation to whole levels.
- **Working, commented code:** the AI must return a complete solution with comments and an example run. Python code is compiled (never executed) to catch syntax errors; if it would not run, the AI is asked once to fix it. Code with too few comments (fewer than about one per three lines) has comments added by a second, narrow request, and the server checks that the code itself is unchanged before using it.
- **Written for beginners:** code answers use only the basics (variables, if/else, loops, functions, lists) with clear names, short lines, a plain-English comment above every step and a runnable example. The server checks Python answers for shortcuts beginners find hard (list comprehensions, lambda, one-line if/else, `[::-1]` slicing, `map`/`filter`, very long lines) and asks for a simpler rewrite; a shortcut the question asks for by name is allowed. Long comments are wrapped to fit small screens.
- **Display:** web, desktop and mobile show code in monospace blocks with comments highlighted and a Copy button, and PDF downloads keep the indentation. Students can paste code into a typed question; Tab indents in the question editors.

### StudySync Bot, themes and voice

- **StudySync Bot:** answers appear as chat messages from a robot assistant, with a "working it out" animation while it thinks. Typed questions are asked through the **Ask StudySync Bot** box.
- **Dark or bright mode:** use the sun / moon button in the top bar (or on the sign-in page). Dark is the default; the choice is remembered on each device.
- **Speak your question:** press **Speak**, ask your question, press **Stop**. In Chrome and Edge the browser recognises speech live. In the desktop app, other browsers and the phone apps, the recording is sent to `POST /api/papers/transcribe` and Gemini turns it into text (about 10-20 seconds). Recordings are WAV (web, iPhone) or AAC (Android), which Gemini accepts, and they are not stored.
- **Follow-up questions:** under every solved question, students can ask the bot more about the answer ("Why does step 2 work?", "Give me a similar practice question"), by typing, speaking or tapping a suggestion. The bot answers using the question, its solution and the conversation so far. Follow-ups are saved with the question, so they appear in History and Saved on every device and are included in PDF downloads. On the phone they open in a full-screen chat so the keyboard never covers the box. **Regenerate** or editing the question starts a fresh conversation.
- **Downloading PDFs:** **Download PDF** (whole paper) and **Download** / **PDF** (one question) create a PDF of the solved questions, with their follow-ups. On the web and desktop it downloads like any file. On Android, choose **Save to phone** and pick a folder such as Download once; later PDFs go there automatically (tap **Change folder** to pick another), or choose **Share** to send it to another app. On iPhone the share sheet opens; choose **Save to Files**.
- **Typing on the phone:** every screen with text boxes scrolls the box you are typing in above the keyboard, and keeps the newest line in view as a long answer grows. Follow-up questions open in a full-screen chat with the box pinned above the keyboard.
- **Listen to the answer:** the **Listen** button reads the answer, steps, explanation and tips aloud with the device's own voice, saying maths naturally ("x squared") and pointing to the screen for code.

### Daily challenges

The **Challenges** tab (web and desktop) and the **Daily** tab (phone) give every student five fresh challenges a day:

- **Three multiple-choice** challenges, marked instantly, and **two short-answer** challenges, typed or spoken, which StudySync Bot marks out of 10 with feedback and a model answer.
- Questions come from the **subjects the student has been studying** (their history), across at least two subjects, and never repeat the last few days. Difficulty adapts: after strong days they get harder, after weak days easier.
- Every point is **XP**: 100 XP per level. Finishing all five keeps the **daily streak** going; the best streak is remembered.
- When the day is done, it is **rated with 1-5 stars** ("Outstanding!" at 90%, "Great work!" at 75% and so on), with a countdown to tomorrow's set and a **chart of the week**.
- A new set starts at the student's local midnight. The first answer counts, and results sync across devices. The phone's **Me** tab shows level, XP and streaks.

The set is created by Gemini the first time the student opens challenges that day (about 10-25 seconds); after that it opens instantly.

### Forgot password

**Forgot password?** on the sign-in screen emails a 6-digit code. The student enters it with a new password and is signed in. On the phone, **Me → Change password** uses the same code.

- Codes expire after 15 minutes, allow 5 wrong tries, and can only be used once. A new code can be requested after 45 seconds, and requesting one replaces the old one.
- The reply is the same whether or not an email has an account, so the form cannot be used to find out who is registered.
- **Setting up email:** fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (and optionally `SMTP_FROM`) in `server/.env` and restart the server. For Gmail, turn on 2-Step Verification, create an **App Password** (Google Account → Security → App passwords) and use `smtp.gmail.com`, port `587`. Until email is set up, the code is printed in the server log (`Password reset code for ...`) so you can still test. `/api/health` shows `"email": true` once it is configured.

### Using StudySync on several devices

All three apps talk to the same API and database, so a student's **history and saved answers follow them**: something asked on the phone appears on the desktop and web apps, and deleting it anywhere removes it everywhere.

- The apps re-read history and saved answers when they come back into view, when **History** or **Saved** is opened, and every 20 seconds while open (pull down to refresh on the phone). History and Saved show "Synced across your devices" with the time of the last update.
- **Which server each app uses:** the desktop app uses this computer (`localhost:5000`). The web app uses the computer it was opened from, so `http://<pc-ip>:5173` on a phone or another laptop reaches the API at `http://<pc-ip>:5000`. The phone app uses the computer running Expo. Override with `VITE_API_URL` (web, desktop) or `EXPO_PUBLIC_API_URL` (mobile).
- **Network:** phones and other computers must be on the same Wi-Fi as the server PC, and Windows Firewall must allow Python (port 5000) and Node.js (ports 5173 and 8081). Some campus or office Wi-Fi networks block devices from talking to each other; if a phone cannot connect, try a phone hotspot or home Wi-Fi.

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

Check the API at http://localhost:5000/api/health. It reports whether MySQL and the Gemini key are configured, and the OCR engine and mode. Interactive API docs (generated by FastAPI) are at http://localhost:5000/docs.

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
    ├── routes/auth.py  register, login, me, forgot and reset password
    ├── routes/papers.py extract (upload + OCR), solve, follow-up questions, transcribe
    ├── routes/history.py history sessions (list, save, delete, clear)
    ├── routes/challenges.py daily challenges (today, answer, stats)
    ├── routes/saved.py saved answers (list, save, remove)
    ├── routes/schemas.py request validation and size limits
    └── services/
        ├── mailer.py   sends password reset codes by SMTP
        ├── challenges.py creates, marks and rates daily challenges
        ├── ocr.py      RapidOCR (and PyMuPDF for PDFs that already contain text)
        └── ai.py       Gemini prompts for splitting, solving and follow-up questions
```

### Pointing the apps at the API

- **Web / desktop:** set `VITE_API_URL` in `web/.env` to override the address (by default the desktop app uses `http://localhost:5000` and the web app uses port 5000 on the computer it was opened from), then rebuild the desktop app.
- **Mobile:** in development the app uses the IP address of the computer running Expo, port 5000, so a phone on the same Wi-Fi works with no setup. To use another server, set `EXPO_PUBLIC_API_URL=http://<server-ip>:5000` in `mobile/.env`. The phone must be able to reach that address, so allow port 5000 through Windows Firewall if needed.

## API reference

Every route except register, login and health needs `Authorization: Bearer <token>`, and only reads or changes the signed-in user's own data.

| Method | Route | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{ fullName, email, password }` | `{ token, user }` |
| POST | `/api/auth/login` | `{ email, password }` | `{ token, user }` |
| GET | `/api/auth/me` | | `{ user }` |
| POST | `/api/auth/forgot-password` | `{ email }` | `{ message, expiresInMinutes, resendAfterSeconds }`. Emails a 6-digit code |
| POST | `/api/auth/reset-password` | `{ email, code, password }` | `{ token, user }`. Sets the new password and signs in |
| POST | `/api/papers/extract` | multipart `file` (PDF/PNG/JPG/WEBP/BMP/TIFF, max 20 MB) | `{ title, subject, questions[], rawText, method, pages }` |
| POST | `/api/papers/transcribe` | multipart `file` (WAV, AAC, MP3, OGG or FLAC, max 10 MB) | `{ text }` |
| POST | `/api/papers/solve` | `{ text, subject?, marks?, context? }` (context: earlier questions in the same section) | `{ answer, steps[], explanation, tips[] }` |
| POST | `/api/papers/followup` | `{ question, subject?, solution?, history[], message }` (history: earlier `{ question, answer }` turns) | `{ answer }` |
| GET | `/api/history` | | `{ history: [session with questions] }`, newest first |
| PUT | `/api/history/{id}` | `{ kind, title, subject, fileName, method, pages, createdAt, questions[] }` (each question may include `followups[]`) | 204. Creates or replaces that session |
| DELETE | `/api/history/{id}` | | 204 |
| DELETE | `/api/history` | | 204. Clears all of the user's history |
| GET | `/api/saved` | | `{ saved: [...] }`, newest first |
| POST | `/api/saved` | `{ id, paperTitle, subject, number, text, marks, solution, followups? }` | `{ saved }`. Saving the same `id` again updates it |
| DELETE | `/api/saved?key={id}` | | 204 |
| GET | `/api/challenges/today?day=YYYY-MM-DD` | | `{ challenge, stats }`. Creates the day's challenges the first time |
| POST | `/api/challenges/{day}/answer` | `{ itemId, choice }` (multiple choice) or `{ itemId, answer }` (short answer) | `{ challenge, stats }` with the result |
| GET | `/api/challenges/stats?day=YYYY-MM-DD` | | `{ stats: { xp, level, streak, bestStreak, daysCompleted, week[] } }` |
| GET | `/api/health` | | `{ status, database, ai, ocr: { engine, mode }, email }` |

## Troubleshooting

- **"Database is unavailable"**: check `DB_*` in `server/.env` and that MySQL is running.
- **"missing a Google Gemini API key"**: set `GEMINI_API_KEY` in `server/.env` and restart the server.
- **"usage limit has been reached"**: the Gemini free tier allows a limited number of requests per minute and per day. Wait a minute (or until the next day), or enable billing in Google AI Studio for higher limits.
- **Answers are slow**: the default `gemini-flash-lite-latest` answers in a few seconds. Larger models such as `gemini-flash-latest` give similar results on exam questions but can take one to two minutes per answer on the free tier.
- **"model ... is not available"**: set `GEMINI_MODEL` in `server/.env` to a model your key can use (see https://ai.google.dev/gemini-api/docs/models).
- **First OCR request is slow**: RapidOCR loads its models when the server starts (and downloads them once if they are missing, which needs internet access). The log shows "RapidOCR is ready." when it has finished. After that, each scanned page takes a few seconds.
- **Reset code email never arrives**: check the spam folder, then the server log. "could not sign in to its email account" means `SMTP_USER` / `SMTP_PASSWORD` are wrong (for Gmail, use an App Password). Without `SMTP_HOST` the code is only printed in the log.
- **Challenges take a while to open**: the day's set is created by the AI the first time it is opened (10-25 seconds); it then opens instantly for the rest of the day on every device.
- **PDF won't save on Android**: tap **Save to phone**, then pick a folder and tap **Use this folder** (Android does not allow saving to the top of the phone's storage). If a saved folder was deleted, the app asks for a new one.
- **Poor OCR results**: use a flat, well-lit photo or a 300 dpi scan. Students can also tap the pencil icon on any question to fix OCR mistakes before solving.
- **Android release builds and `http://`**: Android blocks plain HTTP in release builds. Serve the API over HTTPS for production.
