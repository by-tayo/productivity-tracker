"""Entry point: starts the background collector thread + the Flask dashboard."""
import json
import threading
from datetime import datetime, timedelta
from pathlib import Path

from flask import Flask, jsonify, render_template, request

from tracker import storage
from tracker.collector import run_collector

BASE_DIR = Path(__file__).resolve().parent
CATEGORIES_PATH = BASE_DIR / "categories.json"
PORT = 5151

app = Flask(__name__)


def load_categories():
    """Returns a lowercased-key lookup - Windows process name casing varies
    by vendor (chrome.exe vs WINWORD.EXE), so matching is case-insensitive."""
    if CATEGORIES_PATH.exists():
        with open(CATEGORIES_PATH, "r", encoding="utf-8") as f:
            raw = json.load(f)
        return {name.lower(): category for name, category in raw.items()}
    return {}


def day_bounds(date_str):
    day = datetime.strptime(date_str, "%Y-%m-%d")
    start = day.timestamp()
    end = (day + timedelta(days=1)).timestamp()
    return start, end


def summarize(date_str):
    range_start, range_end = day_bounds(date_str)
    categories = load_categories()
    rows = storage.query_range(range_start, range_end)

    per_app = {}
    per_category = {}
    idle_seconds = 0.0
    timeline = []

    for app_name, window_title, is_idle, start_ts, end_ts in rows:
        clipped_start = max(start_ts, range_start)
        clipped_end = min(end_ts, range_end)
        duration = clipped_end - clipped_start
        if duration <= 0:
            continue

        timeline.append(
            {
                "app": app_name,
                "title": window_title,
                "is_idle": bool(is_idle),
                "start": clipped_start,
                "end": clipped_end,
            }
        )

        if is_idle:
            idle_seconds += duration
            continue

        per_app[app_name] = per_app.get(app_name, 0.0) + duration
        category = categories.get(app_name.lower(), "Uncategorized")
        per_category[category] = per_category.get(category, 0.0) + duration

    active_seconds = sum(per_app.values())
    top_app = max(per_app, key=per_app.get) if per_app else None

    return {
        "date": date_str,
        "active_seconds": active_seconds,
        "idle_seconds": idle_seconds,
        "top_app": top_app,
        "per_app": sorted(per_app.items(), key=lambda kv: kv[1], reverse=True),
        "per_category": sorted(per_category.items(), key=lambda kv: kv[1], reverse=True),
        "timeline": sorted(timeline, key=lambda seg: seg["start"]),
        "range_start": range_start,
        "range_end": range_end,
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/summary")
def api_summary():
    date_str = request.args.get("date") or datetime.now().strftime("%Y-%m-%d")
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "date must be YYYY-MM-DD"}), 400
    return jsonify(summarize(date_str))


def start_collector_thread():
    stop_event = threading.Event()
    thread = threading.Thread(target=run_collector, args=(stop_event,), daemon=True)
    thread.start()
    return stop_event


if __name__ == "__main__":
    storage.init_db()
    start_collector_thread()
    print(f"Dashboard running at http://127.0.0.1:{PORT}")
    app.run(host="127.0.0.1", port=PORT, debug=False)
