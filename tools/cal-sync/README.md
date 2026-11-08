# Cal sync on the Mac

Downloads the Cal card statement (Excel) a few times a day and uploads it to the Finance API, which imports it as a mid-cycle (partial) statement. It runs on the Mac because Cal rejects cloud servers and headless browsers: the script opens your installed **Google Chrome as a normal visible window** for about a minute per run.

If Cal asks for an SMS code, an iPhone Shortcut forwards Cal's SMS to the Finance API and the script picks the code up. You don't touch anything.

## One-time setup

### 1. Cal username and password
On [cal-online.co.il](https://www.cal-online.co.il/) → **כניסה לחשבון** → **כניסה עם שם משתמש** → **ליצירת שם משתמש חדש**. Create a username and a fixed password.

### 2. Secrets in the macOS Keychain
Each command asks you to type the value, so nothing lands in your shell history:

```bash
security add-generic-password -U -s finance-cal-sync -a cal-username -w
security add-generic-password -U -s finance-cal-sync -a cal-password -w
security add-generic-password -U -s finance-cal-sync -a ingest-key -w
```

`ingest-key` is the same value as `INGEST_SECRET` on the Render API (Render dashboard → finance-api → Environment).

Only for SMS sign-in instead of a password (`"loginMode": "sms"`):

```bash
security add-generic-password -U -s finance-cal-sync -a cal-id -w
```

### 3. Settings (not secret)

```bash
mkdir -p ~/.config/finance-cal-sync
cat > ~/.config/finance-cal-sync/config.json <<'JSON'
{ "apiBase": "https://YOUR-API.onrender.com", "cardLast4": "1234", "loginMode": "password" }
JSON
```

`cardLast4` picks the card if you have several (optional with one card).

### 4. iPhone Shortcut for SMS codes
Shortcuts app → **Automation** → **+** → **Message**:
- **Sender:** Cal's SMS sender (as it appears in Messages), **Message contains:** `קוד` (or the word Cal uses in its code SMS)
- **Run Immediately** (not "Run after confirmation"), notifications off if you like
- Action **Get Contents of URL**:
  - URL: `https://YOUR-API.onrender.com/api/ingest/otp`
  - Method: **POST**
  - Headers: `X-Ingest-Key` = your ingest key
  - Request Body: **JSON**, key `text` = **Shortcut Input** (the message)

The API pulls the code out of the message, keeps it in memory for 5 minutes, and hands it to the script once.

### 5. Install the dependency and test

```bash
cd tools/cal-sync
npm install
npm run check   # opens Cal's login page, no sign-in
npm run sync    # full run: sign in, export, upload
```

### 6. Schedule it

```bash
./install.sh                 # 08:30, 13:30, 20:30
./install.sh 09:00 21:00     # or your own times
./install.sh --uninstall
```

The Mac must be on and you must be logged in. If it was asleep at a scheduled time, the run happens when it wakes.

## When something goes wrong
- A macOS notification says what failed. Details: `~/Library/Logs/finance-cal-sync.log`.
- **"Cal rejected this browser":** Cal's protection flagged the run. Try again later. The script does not disguise the browser.
- **"No SMS code arrived":** check the Shortcut (sender, Run Immediately, URL and key).
- **"change the password":** Cal wants a new password. Change it in the Cal app, then run step 2 again for `cal-password`.
