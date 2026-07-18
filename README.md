# Productivity Tracker

Logs which app/window has focus and how much of the day is idle vs. active.
Dashboard at `http://127.0.0.1:5151`. All data stays local in
`data/activity.db` (SQLite).

<img width="1837" height="1900" alt="image" src="https://github.com/user-attachments/assets/a0fce1f5-596a-4781-aebb-3ed499c132e9" />


## Run it

```powershell
cd productivity-tracker
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python app.py
```

Open http://127.0.0.1:5151. Polls the active window every 5 seconds; marks
idle after 2 minutes without keyboard/mouse input.

## Categories

Edit `categories.json` to map an executable name to a category, e.g.
`"chrome.exe": "Browsing"`. Changes apply on refresh, no restart needed. Run
`python find_uncategorized.py` to list apps you've used that aren't mapped
yet.

## Privacy

Window titles are stored by default (browser tab names, document titles) so
the timeline tooltip can show what you were looking at. To store only the app
name, set in `tracker/collector.py`:

```python
CAPTURE_WINDOW_TITLE = False
```

## Autostart

A shortcut in the Startup folder launches it hidden at login:

`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ProductivityTracker.lnk`

To disable: press `Win+R`, type `shell:startup`, delete the shortcut.

## Notes

- `data/activity.db` is gitignored.
- Restarting the app starts a fresh session instead of merging into an old
  one after a gap, so sleep/shutdown time isn't counted as active or idle.
- Dashboard runs on port `5151`.
