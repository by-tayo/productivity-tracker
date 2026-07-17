# Productivity Tracker

A small local app that logs which app/window has focus on this laptop and how
much of the day is idle vs. active, and shows it on a dashboard at
`http://127.0.0.1:5151`. Everything is stored locally in `data/activity.db`
(SQLite) — nothing leaves the machine.

## Run it

```powershell
cd productivity-tracker
python -m venv .venv        # first time only
.venv\Scripts\pip install -r requirements.txt   # first time only
.venv\Scripts\python app.py
```

Open http://127.0.0.1:5151. Leave the process running while you work — it
polls the active window every 5 seconds in a background thread and marks you
idle after 2 minutes without keyboard/mouse input.

## Categories

Edit `categories.json` to map an executable name to a category (e.g.
`"chrome.exe": "Browsing"`). Anything not listed shows up under
"Uncategorized". The dashboard's per-app and per-category breakdowns both read
this file live — no restart needed, just refresh the page.

## Privacy

Window titles (e.g. browser tab names, document titles) are stored locally by
default so the timeline tooltip can show what you were actually looking at.
If you'd rather only track the app name and not the title text, open
`tracker/collector.py` and set:

```python
CAPTURE_WINDOW_TITLE = False
```

## Run it automatically at login

Set up via a shortcut in your Startup folder (`schtasks`/Task Scheduler was
tried first but denied by the current shell's permissions, so this is the
mechanism actually in place):

`C:\Users\tayli\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\ProductivityTracker.lnk`

It launches `.venv\Scripts\pythonw.exe app.py` hidden (no console window)
whenever you log in. To disable autostart, delete that `.lnk` file (or press
`Win+R`, type `shell:startup`, and delete it from the folder that opens).

## Notes

- Data lives in `data/activity.db`, which is gitignored — it's yours, not
  meant to be committed.
- If the app is stopped and restarted, it won't merge the new session into an
  old one from before the gap (see `MAX_EXTEND_GAP_SECONDS` in
  `tracker/storage.py`), so sleep/shutdown gaps don't get miscounted.
- Port `5151` was picked to avoid clashing with other local services on this
  machine (`winexporter` on 9180, various Docker projects on 3000/5000/8080/9090).
