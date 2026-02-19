"""Tests for the file/directory watcher (Phase 8)."""

from __future__ import annotations

import tempfile
import time
from pathlib import Path
from unittest.mock import MagicMock

from pipeline.watcher import LogFileHandler, LogWatcher


class TestLogFileHandlerDebounce:
    """Calling the handler twice quickly should only trigger the callback once."""

    def test_debounce_suppresses_duplicate(self):
        cb = MagicMock()
        handler = LogFileHandler(callback=cb, debounce_seconds=5.0)

        # Simulate two rapid on_created events for the same .log file
        event = MagicMock()
        event.is_directory = False
        event.src_path = "/tmp/test.log"

        handler.on_created(event)
        handler.on_created(event)

        cb.assert_called_once_with("/tmp/test.log")

    def test_debounce_allows_after_window(self):
        cb = MagicMock()
        handler = LogFileHandler(callback=cb, debounce_seconds=0.1)

        event = MagicMock()
        event.is_directory = False
        event.src_path = "/tmp/test.log"

        handler.on_created(event)
        time.sleep(0.15)
        handler.on_modified(event)

        assert cb.call_count == 2


class TestLogFileHandlerExtensionFilter:
    """Only .log and .txt files should trigger the callback."""

    def test_log_extension_triggers(self):
        cb = MagicMock()
        handler = LogFileHandler(callback=cb, debounce_seconds=0)

        event = MagicMock()
        event.is_directory = False
        event.src_path = "/tmp/server.log"
        handler.on_created(event)
        cb.assert_called_once_with("/tmp/server.log")

    def test_txt_extension_triggers(self):
        cb = MagicMock()
        handler = LogFileHandler(callback=cb, debounce_seconds=0)

        event = MagicMock()
        event.is_directory = False
        event.src_path = "/tmp/output.txt"
        handler.on_created(event)
        cb.assert_called_once_with("/tmp/output.txt")

    def test_py_extension_does_not_trigger(self):
        cb = MagicMock()
        handler = LogFileHandler(callback=cb, debounce_seconds=0)

        event = MagicMock()
        event.is_directory = False
        event.src_path = "/tmp/script.py"
        handler.on_created(event)
        cb.assert_not_called()

    def test_directory_event_does_not_trigger(self):
        cb = MagicMock()
        handler = LogFileHandler(callback=cb, debounce_seconds=0)

        event = MagicMock()
        event.is_directory = True
        event.src_path = "/tmp/logs"
        handler.on_created(event)
        cb.assert_not_called()


class TestLogWatcherStartStop:
    """LogWatcher should start and stop cleanly."""

    def test_start_and_stop(self):
        tmp_dir = tempfile.mkdtemp()
        cb = MagicMock()
        watcher = LogWatcher(watch_dir=tmp_dir, callback=cb)

        assert not watcher.is_running

        watcher.start()
        assert watcher.is_running

        watcher.stop()
        assert not watcher.is_running

    def test_double_start_is_idempotent(self):
        tmp_dir = tempfile.mkdtemp()
        cb = MagicMock()
        watcher = LogWatcher(watch_dir=tmp_dir, callback=cb)

        watcher.start()
        watcher.start()  # should not raise or create a second observer
        assert watcher.is_running

        watcher.stop()
        assert not watcher.is_running

    def test_stop_when_not_started(self):
        tmp_dir = tempfile.mkdtemp()
        cb = MagicMock()
        watcher = LogWatcher(watch_dir=tmp_dir, callback=cb)

        watcher.stop()  # should not raise
        assert not watcher.is_running

    def test_watcher_detects_new_log_file(self):
        tmp_dir = tempfile.mkdtemp()
        cb = MagicMock()
        watcher = LogWatcher(watch_dir=tmp_dir, callback=cb, debounce_seconds=0)

        watcher.start()
        try:
            # Give the observer a moment to initialize
            time.sleep(0.3)

            # Create a .log file in the watched directory
            log_file = Path(tmp_dir) / "alert.log"
            log_file.write_text("suspicious activity detected")

            # Wait for the event to propagate
            time.sleep(1.0)

            assert cb.call_count >= 1
            # The callback should have been called with the path to the new file
            called_path = cb.call_args_list[0][0][0]
            assert called_path.endswith("alert.log")
        finally:
            watcher.stop()
