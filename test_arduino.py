"""Simple test script for the Arduino LED controller.

Run from the project root with the virtualenv active:

    python test_arduino.py

This will select the Arduino LED backend, cycle a few example states,
then cleanly stop the controller.
"""

import time

from modules import led_controller


def main():
    print("Starting Arduino LED test (non-blocking)...")
    try:
        led_controller.set_led_backend("arduino")
        print(f"LED backend: {led_controller.get_led_backend()}")

        led_controller.set_state("focused")
        time.sleep(2.0)

        led_controller.set_state("distracted")
        time.sleep(2.0)

        led_controller.set_state("neutral")
        time.sleep(1.5)

        led_controller.set_state("off")
        time.sleep(0.6)
    except KeyboardInterrupt:
        print("Interrupted by user")
    finally:
        print("Stopping LED controller...")
        led_controller.stop()


if __name__ == "__main__":
    main()
