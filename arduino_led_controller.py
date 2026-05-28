import logging
import queue
import threading
import time
from typing import Optional

try:
    import serial
    from serial.tools import list_ports
    _HAS_SERIAL = True
except Exception:
    serial = None  # type: ignore
    list_ports = None  # type: ignore
    _HAS_SERIAL = False

_LOG = logging.getLogger(__name__)

_STATE_COMMANDS = {
    "focused": b"F",
    "distracted": b"D",
    "neutral": b"N",
    "off": b"O",
}


class ArduinoLedController:
    """Non-blocking Arduino LED controller over USB serial."""

    def __init__(
        self,
        port: Optional[str] = None,
        baudrate: int = 9600,
        queue_size: int = 16,
        connect_timeout: float = 2.0,
    ):
        self._cmd_q = queue.Queue(maxsize=queue_size)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._started = False
        self._serial: Optional[serial.Serial] = None
        self._port = port
        self._baudrate = int(baudrate)
        self._connect_timeout = float(connect_timeout)
    def _connect(self) -> None:
        if not _HAS_SERIAL:
            _LOG.warning("pyserial not installed; Arduino LED controller is running in noop mode")
            return

        port = self._port or self._find_arduino_port()
        if port is None:
            _LOG.warning("No Arduino COM port found; falling back to noop mode")
            return

        try:
            self._serial = serial.Serial(port, self._baudrate, timeout=0.2)
            time.sleep(2.0) # Crucial: Let the Arduino bootloader finish
            
            # SEND A RESET COMMAND (Assuming 'O' is Off/Reset in your Arduino code)
            self._serial.write(b"O") 
            self._serial.flush()
            
            _LOG.info("Arduino reset and ready.")
        except Exception as e:
            _LOG.error(f"Hardware connection failed: {e}")
            raise e # This makes it LOUD so you know it failed

    def _find_arduino_port(self) -> Optional[str]:
        if not _HAS_SERIAL or list_ports is None:
            return None

        try:
            ports = list_ports.comports()
        except Exception:
            _LOG.exception("Failed to enumerate serial ports")
            return None

        matches = []
        for port_info in ports:
            device = port_info.device
            if not device:
                continue
            description = (port_info.description or "").lower()
            manufacturer = (port_info.manufacturer or "").lower()
            if any(keyword in description for keyword in ("arduino", "uno", "usb serial", "ch340", "ft232")):
                return device
            if any(keyword in manufacturer for keyword in ("arduino", "uno", "ch340", "ft232")):
                return device
            matches.append(device)

        return matches[0] if matches else None

    def ensure_started(self) -> None:
        if not self._started:
            self._started = True
            self._thread.start()

    def _worker(self) -> None:
        self._connect()
        try:
            while not self._stop.is_set():
                try:
                    cmd = self._cmd_q.get(timeout=0.12)
                except queue.Empty:
                    continue

                if cmd is None:
                    break

                try:
                    self._process_cmd(cmd)
                except Exception:
                    _LOG.exception("Error processing Arduino LED command")
                finally:
                    try:
                        self._cmd_q.task_done()
                    except Exception:
                        pass
        finally:
            self._close_serial()

    def _process_cmd(self, cmd: bytes) -> None:
        if not self._serial or not self._serial.is_open:
            _LOG.debug("Arduino serial unavailable; dropping LED command %r", cmd)
            return

        try:
            self._serial.write(cmd)
            self._serial.flush()
            _LOG.debug("Sent Arduino LED command: %r", cmd)
        except Exception:
            _LOG.exception("Failed to write to Arduino serial port")
            self._close_serial()

    def set_state(self, state: str) -> None:
        command = _STATE_COMMANDS.get(state.lower())
        if command is None:
            _LOG.warning("Unsupported LED state %r; supported states are: %s", state, list(_STATE_COMMANDS))
            return

        self.ensure_started()
        try:
            self._cmd_q.put_nowait(command)
        except queue.Full:
            _LOG.debug("Arduino LED queue full, dropping state %s", state)

    def stop(self, wait: bool = True) -> None:
        """Stops the controller thread and shuts down serial communications.
        
        This matches the signature expected by the main led_controller interface.
        """
        self._stop.set()
        try:
            self._cmd_q.put_nowait(None)
        except Exception:
            pass

        if wait and self._started and self._thread.is_alive():
            self._thread.join(timeout=1.0)

        self._started = False
        self._stop.clear()
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._close_serial()

    def close(self, wait: bool = True) -> None:
        """Alias for stop() to support context manager layouts."""
        self.stop(wait=wait)

    def _close_serial(self) -> None:
        if self._serial is not None:
            try:
                if self._serial.is_open:
                    # Send an "OFF" command before closing to reset the physical LED
                    self._serial.write(b"O") 
                    self._serial.flush()
                    self._serial.close()
                    _LOG.info("Arduino serial connection closed and LED reset")
            except Exception:
                _LOG.exception("Error closing Arduino serial port")
            finally:
                self._serial = None

    def __enter__(self) -> "ArduinoLedController":
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self.stop()
