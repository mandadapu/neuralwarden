"""File/directory watcher — auto-triggers pipeline analysis when log files appear."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Callable

from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer


class LogFileHandler(FileSystemEventHandler):
    """Watches for new/modified .log and .txt files and triggers a callback."""

    WATCHED_EXTENSIONS = {".log", ".txt"}

    def __init__(
        self,
        callback: Callable[[str], None],
        debounce_seconds: float = 5.0,
    ) -> None:
        super().__init__()
        self.callback = callback
        self.debounce_seconds = debounce_seconds
        self._last_event_time: dict[str, float] = {}

    def _should_process(self, path: str) -> bool:
        """Return True if the file has a watched extension and is not within the debounce window."""
        ext = Path(path).suffix.lower()
        if ext not in self.WATCHED_EXTENSIONS:
            return False
        now = time.time()
        last = self._last_event_time.get(path, 0.0)
        if now - last < self.debounce_seconds:
            return False
        self._last_event_time[path] = now
        return True

    def on_created(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        if self._should_process(event.src_path):
            self.callback(event.src_path)

    def on_modified(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        if self._should_process(event.src_path):
            self.callback(event.src_path)


class LogWatcher:
    """High-level wrapper that observes a directory for log file changes."""

    def __init__(
        self,
        watch_dir: str,
        callback: Callable[[str], None],
        debounce_seconds: float = 5.0,
    ) -> None:
        self.watch_dir = watch_dir
        self.callback = callback
        self.debounce_seconds = debounce_seconds
        self._observer: Observer | None = None

    def start(self) -> None:
        """Create an Observer and start watching the directory."""
        if self._observer is not None:
            return
        handler = LogFileHandler(self.callback, self.debounce_seconds)
        self._observer = Observer()
        self._observer.schedule(handler, self.watch_dir, recursive=False)
        self._observer.start()

    def stop(self) -> None:
        """Stop the Observer if it is running."""
        if self._observer is not None:
            self._observer.stop()
            self._observer.join()
            self._observer = None

    @property
    def is_running(self) -> bool:
        return self._observer is not None and self._observer.is_alive()
