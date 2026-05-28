import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

# Ensure the repository root is on sys.path when running this test directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import modules.led_controller as led_controller
import arduino_led_controller


class ArduinoLedControllerTests(unittest.TestCase):
    def test_set_state_writes_focus_command(self):
        port_info = SimpleNamespace(
            device="COM3",
            description="Arduino Uno",
            manufacturer="Arduino",
        )
        mock_serial_instance = MagicMock()
        with patch.object(arduino_led_controller, "_HAS_SERIAL", True), \
            patch.object(arduino_led_controller, "list_ports") as list_ports_module, \
            patch.object(arduino_led_controller, "serial") as serial_module:
            list_ports_module.comports.return_value = [port_info]
            serial_module.Serial.return_value = mock_serial_instance

            controller = arduino_led_controller.ArduinoLedController()
            controller.ensure_started()
            controller.set_state("focused")
            controller._cmd_q.join()

            mock_serial_instance.write.assert_called_with(b"F")
            controller.close()

    def test_close_closes_serial(self):
        port_info = SimpleNamespace(
            device="COM3",
            description="Arduino Uno",
            manufacturer="Arduino",
        )
        mock_serial_instance = MagicMock()
        mock_serial_instance.is_open = True
        with patch.object(arduino_led_controller, "_HAS_SERIAL", True), \
            patch.object(arduino_led_controller, "list_ports") as list_ports_module, \
            patch.object(arduino_led_controller, "serial") as serial_module:
            list_ports_module.comports.return_value = [port_info]
            serial_module.Serial.return_value = mock_serial_instance

            controller = arduino_led_controller.ArduinoLedController()
            controller.close()

            mock_serial_instance.close.assert_called_once()


class LedControllerBackendTests(unittest.TestCase):
    def test_set_led_backend_accepts_supported_backends(self):
        original = led_controller.get_led_backend()
        try:
            led_controller.set_led_backend("arduino")
            self.assertEqual(led_controller.get_led_backend(), "arduino")
            led_controller.set_led_backend("blink1")
            self.assertEqual(led_controller.get_led_backend(), "blink1")
        finally:
            led_controller.set_led_backend(original)

    def test_set_led_backend_rejects_invalid_backend(self):
        with self.assertRaises(ValueError):
            led_controller.set_led_backend("invalid-backend")


if __name__ == "__main__":
    unittest.main()
