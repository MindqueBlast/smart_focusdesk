"""Simple test script for the blink(1) LED controller.



Run from the project root with the virtualenv active:



    python test_blink1.py



This will cycle a few example states then cleanly stop the controller.

"""

import time

from modules import led_controller





def main():

    print("Starting blink1 LED test (non-blocking)...")

    try:

        led_controller.set_state("focused")

        time.sleep(2.0)

        led_controller.set_state("distracted")

        time.sleep(2.0)

        # custom RGB

        led_controller.set_rgb(255, 0, 255, ms=300)

        time.sleep(1.5)

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

