import os
import threading
import queue
import time
import logging
from typing import Any, Optional

try:
    from blink1.blink1 import blink1
    _HAS_BLINK1 = True
except Exception:
    blink1 = None
    _HAS_BLINK1 = False

try:
    from arduino_led_controller import ArduinoLedController as _ArduinoLedController
    _HAS_ARDUINO = True
except Exception:
    _ArduinoLedController = None  # type: ignore
    _HAS_ARDUINO = False

_LOG = logging.getLogger(__name__)

BLINK1_BACKEND = "blink1"
ARDUINO_BACKEND = "arduino"
_DEFAULT_LED_BACKEND = os.environ.get("SMART_FOCUS_LED_BACKEND", ARDUINO_BACKEND).lower()
_LED_BACKEND = _DEFAULT_LED_BACKEND


class LedController:
    """Non-blocking controller for blink(1) USB indicator.

    The worker thread opens the device using the library's context manager
    and processes fade commands from a queue. If the library or hardware is
    not available the controller becomes a noop but keeps the same API.
    """

    def __init__(self, fade_ms: int = 200):
        self._cmd_q = queue.Queue(maxsize=16)
        self._stop = threading.Event()
        self._fade_ms = int(fade_ms)
        self._current_state: Optional[str] = None
        
        # Thread will be started explicitly on first command
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._started = False

    def ensure_started(self):
        """Starts the worker thread if it hasn't been started yet."""
        if not self._started:
            self._started = True
            self._thread.start()

    def _worker(self):
        if _HAS_BLINK1:
            try:
                with blink1() as b1:
                    _LOG.info("blink1 device opened")
                    while not self._stop.is_set():
                        try:
                            cmd = self._cmd_q.get(timeout=0.12)
                        except queue.Empty:
                            continue
                        if cmd is None:
                            break
                        try:
                            self._process_cmd(b1, cmd)
                        except Exception:
                            _LOG.exception("Error processing blink1 command")
                        finally:
                            try:
                                self._cmd_q.task_done()
                            except Exception:
                                pass
            except Exception:
                _LOG.exception("Failed to open blink1 device; falling back to noop")
                # drain queue as noop
                while not self._stop.is_set():
                    try:
                        _ = self._cmd_q.get(timeout=0.12)
                        self._cmd_q.task_done()
                    except queue.Empty:
                        continue
        else:
            _LOG.info("blink1 library not available; LED controller is noop")
            while not self._stop.is_set():
                try:
                    cmd = self._cmd_q.get(timeout=0.12)
                except queue.Empty:
                    continue
                _LOG.debug("LED noop command: %s", cmd)
                try:
                    self._cmd_q.task_done()
                except Exception:
                    pass

    def _process_cmd(self, b1, cmd):
        if cmd[0] == "fade":
            _, ms, color = cmd
            try:
                b1.fade_to_color(int(ms), color)
            except Exception:
                try:
                    if isinstance(color, tuple) and len(color) == 3:
                        r, g, b = color
                        b1.fade_to_rgb(int(ms), int(r), int(g), int(b))
                except Exception:
                    _LOG.exception("blink1 fade failed")
        elif cmd[0] == "rgb":
            _, ms, r, g, b = cmd
            try:
                b1.fade_to_rgb(int(ms), int(r), int(g), int(b))
            except Exception:
                _LOG.exception("blink1 fade_to_rgb failed")

    def set_state(self, state: str) -> None:
        color_map = {
            "distracted": "red",
            "focused": "green",
            "neutral": "blue",
            "blink": "yellow",
            "off": "black",
        }
        color = color_map.get(state, "white")
        self._current_state = state
        self.ensure_started()
        try:
            self._cmd_q.put_nowait(("fade", self._fade_ms, color))
        except queue.Full:
            _LOG.debug("LED queue full, dropping state %s", state)

    def set_rgb(self, r: int, g: int, b: int, ms: Optional[int] = None) -> None:
        ms = int(ms or self._fade_ms)
        self.ensure_started()
        try:
            self._cmd_q.put_nowait(("rgb", ms, int(r), int(g), int(b)))
        except queue.Full:
            _LOG.debug("LED queue full, dropping rgb %s", (r, g, b))

    def stop(self, wait: bool = True) -> None:
        self._stop.set()
        try:
            self._cmd_q.put_nowait(None)
        except Exception:
            pass
        if wait and self._started and self._thread.is_alive():
            self._thread.join(timeout=1.0)


# Global tracking instance (lazy instantiated via helper wrappers)
_CONTROLLER_INSTANCE: Optional[Any] = None

def _get_controller() -> Any:
    global _CONTROLLER_INSTANCE
    if _CONTROLLER_INSTANCE is None:
        if _LED_BACKEND == ARDUINO_BACKEND:
            if _HAS_ARDUINO:
                _CONTROLLER_INSTANCE = _ArduinoLedController()
            else:
                _LOG.warning(
                    "Arduino backend requested but arduino_led_controller module is unavailable; falling back to blink1/noop"
                )
                _CONTROLLER_INSTANCE = LedController()
        else:
            _CONTROLLER_INSTANCE = LedController()
    return _CONTROLLER_INSTANCE


def set_led_backend(backend: str) -> None:
    global _LED_BACKEND, _CONTROLLER_INSTANCE
    backend = backend.lower()
    if backend not in {BLINK1_BACKEND, ARDUINO_BACKEND}:
        raise ValueError(
            f"Unsupported LED backend {backend!r}. Valid backends are: {BLINK1_BACKEND}, {ARDUINO_BACKEND}"
        )
    if backend == _LED_BACKEND:
        return
    if _CONTROLLER_INSTANCE is not None:
        try:
            _CONTROLLER_INSTANCE.stop()
        except:
            pass
        _CONTROLLER_INSTANCE = None 
        
    _LED_BACKEND = backend


def get_led_backend() -> str:
    return _LED_BACKEND


def set_state(state: str) -> None:
    _get_controller().set_state(state)

def set_rgb(r: int, g: int, b: int, ms: Optional[int] = None) -> None:
    _get_controller().set_rgb(r, g, b, ms=ms)

def stop() -> None:
    if _CONTROLLER_INSTANCE is not None:
        _CONTROLLER_INSTANCE.stop()

def stop_controller() -> None:
    stop()