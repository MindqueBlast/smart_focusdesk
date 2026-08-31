import { describe, expect, it } from "vitest";
import { classifyFallbackFocus } from "@/lib/cv/focus-classifier";

describe("classifyFallbackFocus", () => {
  it("detects hard yaw limit", () => {
    const result = classifyFallbackFocus(45, {
      horizontal_ratio: 0.5,
      vertical_ratio: 0.5,
      is_blinking: false,
      pupils_located: true,
    });
    expect(result.status).toBe("LOOKING RIGHT");
  });

  it("returns focused when centered", () => {
    const result = classifyFallbackFocus(5, {
      horizontal_ratio: 0.5,
      vertical_ratio: 0.5,
      is_blinking: false,
      pupils_located: true,
    });
    expect(result.status).toBe("FOCUSED");
  });

  it("detects gaze away", () => {
    const result = classifyFallbackFocus(5, {
      horizontal_ratio: 0.85,
      vertical_ratio: 0.5,
      is_blinking: false,
      pupils_located: true,
    });
    expect(result.status).toBe("GAZE AWAY");
  });
});
