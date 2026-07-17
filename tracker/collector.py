"""Active-window + idle detection via raw ctypes calls (no pywin32 needed)."""
import ctypes
from ctypes import wintypes
import time

import psutil

from . import storage

POLL_INTERVAL_SECONDS = 5
IDLE_THRESHOLD_SECONDS = 120
# Set False if you'd rather not persist window titles (e.g. browser tab
# names, document titles) - only the process name is stored then.
CAPTURE_WINDOW_TITLE = True

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

user32.GetForegroundWindow.restype = wintypes.HWND
user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
kernel32.GetTickCount64.restype = ctypes.c_ulonglong


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]


def get_idle_seconds():
    lii = LASTINPUTINFO()
    lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
    if not user32.GetLastInputInfo(ctypes.byref(lii)):
        return 0.0
    tick_count = kernel32.GetTickCount64() & 0xFFFFFFFF  # dwTime wraps at 32 bits
    return max(0, tick_count - lii.dwTime) / 1000.0


def get_active_window():
    """Returns (app_name, window_title). Falls back to ("Unknown", None)."""
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return "Unknown", None

    length = user32.GetWindowTextLengthW(hwnd)
    title = None
    if length > 0:
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = buf.value or None

    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))

    app_name = "Unknown"
    if pid.value:
        try:
            app_name = psutil.Process(pid.value).name()
        except (psutil.NoSuchProcess, psutil.AccessDenied, ValueError):
            pass

    return app_name, title


def collect_once():
    idle_seconds = get_idle_seconds()
    is_idle = idle_seconds >= IDLE_THRESHOLD_SECONDS

    if is_idle:
        return "Idle", None, True

    app_name, title = get_active_window()
    if not CAPTURE_WINDOW_TITLE:
        title = None
    return app_name, title, False


def run_collector(stop_event):
    """Runs until stop_event is set. Intended to run in a background thread."""
    storage.init_db()
    while not stop_event.is_set():
        try:
            app_name, title, is_idle = collect_once()
            storage.record_tick(app_name, title, is_idle, time.time(), POLL_INTERVAL_SECONDS)
        except Exception as exc:  # keep the collector alive across transient errors
            print(f"[collector] error: {exc}")
        stop_event.wait(POLL_INTERVAL_SECONDS)
