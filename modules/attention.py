import time

try:
    import winsound
except ImportError:
    winsound = None

try:
    from modules.led_controller import set_state as _led_set_state
except Exception:
    _led_set_state = None


class AttentionMixin:
    def _format_duration(self, seconds):
        secs = max(0, int(seconds))
        minutes = secs // 60
        rem_secs = secs % 60
        return f"{minutes:02d}:{rem_secs:02d}"

    def _focus_percentage(self):
        total = self.total_focus_time + self.total_distracted_time
        if total <= 0:
            return 0.0
        return (self.total_focus_time / total) * 100.0

    def _update_attention_tracking(self, is_distracted):
        now = time.monotonic()
        elapsed = max(0.0, now - self._last_attention_ts)
        self._last_attention_ts = now

        if is_distracted:
            self.total_distracted_time += elapsed
            self._consecutive_distraction_time += elapsed
            if self._consecutive_distraction_time >= self.DISTRACTION_ALERT_SECONDS:
                if not self._alert_active:
                    self._alert_active = True
                    if not self._alert_sound_played:
                        self._play_alert_sound()
                        self._alert_sound_played = True
        else:
            self.total_focus_time += elapsed
            self._consecutive_distraction_time = 0.0
            self._alert_active = False
            self._alert_sound_played = False

        # Update external LED indicator only when the sustained alert state changes
        try:
            if _led_set_state is not None:
                new_state = "distracted" if self._alert_active else "focused"
                if getattr(self, "_last_led_state", None) != new_state:
                    _led_set_state(new_state)
                    self._last_led_state = new_state
        except Exception:
            # Don't let LED failures affect tracking
            pass

    def _play_alert_sound(self):
        if winsound is not None:
            try:
                winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
            except RuntimeError:
                pass

