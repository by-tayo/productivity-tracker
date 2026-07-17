"""SQLite storage for activity sessions."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "activity.db"

# A tick that lands more than this many seconds after the open session's last
# end_ts does not extend it (covers sleep/hibernate/restart gaps) - it starts
# a fresh session instead, so gaps never get silently counted as active/idle time.
MAX_EXTEND_GAP_SECONDS = 30


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_name TEXT NOT NULL,
                window_title TEXT,
                is_idle INTEGER NOT NULL,
                start_ts REAL NOT NULL,
                end_ts REAL NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_range ON sessions(start_ts, end_ts)"
        )
        conn.commit()


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
    finally:
        conn.close()


def get_latest_session(conn):
    """Returns (id, app_name, window_title, is_idle, start_ts, end_ts) or None."""
    return conn.execute(
        "SELECT id, app_name, window_title, is_idle, start_ts, end_ts "
        "FROM sessions ORDER BY id DESC LIMIT 1"
    ).fetchone()


def extend_session(conn, session_id, end_ts, window_title):
    conn.execute(
        "UPDATE sessions SET end_ts = ?, window_title = ? WHERE id = ?",
        (end_ts, window_title, session_id),
    )
    conn.commit()


def insert_session(conn, app_name, window_title, is_idle, start_ts, end_ts):
    conn.execute(
        "INSERT INTO sessions (app_name, window_title, is_idle, start_ts, end_ts) "
        "VALUES (?, ?, ?, ?, ?)",
        (app_name, window_title, int(is_idle), start_ts, end_ts),
    )
    conn.commit()


def record_tick(app_name, window_title, is_idle, now):
    """Extends the open session if it matches, otherwise starts a new one."""
    with get_conn() as conn:
        latest = get_latest_session(conn)
        if (
            latest
            and latest[1] == app_name
            and latest[3] == int(is_idle)
            and (now - latest[5]) <= MAX_EXTEND_GAP_SECONDS
        ):
            extend_session(conn, latest[0], now, window_title)
        else:
            insert_session(conn, app_name, window_title, is_idle, now, now)


def query_range(day_start_ts, day_end_ts):
    """Sessions overlapping [day_start_ts, day_end_ts)."""
    with get_conn() as conn:
        return conn.execute(
            """
            SELECT app_name, window_title, is_idle, start_ts, end_ts
            FROM sessions
            WHERE start_ts < ? AND end_ts > ?
            ORDER BY start_ts
            """,
            (day_end_ts, day_start_ts),
        ).fetchall()
