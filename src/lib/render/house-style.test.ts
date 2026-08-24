import { describe, expect, it } from "vitest";
import { plain, HOUSE_STYLES, HOUSE_FONT, HOUSE_SIZE } from "./house-style";

describe("plain", () => {
  it("replaces the em dash, the strongest machine-written tell", () => {
    expect(plain("Sample Size — Is It Correct?")).toBe("Sample Size - Is It Correct?");
    expect(plain("P — Population")).toBe("P - Population");
  });

  it("replaces en dashes and minus signs with a plain hyphen", () => {
    expect(plain("grade II–IV")).toBe("grade II-IV");
    expect(plain("−5")).toBe("-5");
  });

  it("straightens smart quotes and the ellipsis", () => {
    expect(plain("the “primary” outcome…")).toBe('the "primary" outcome...');
    expect(plain("don’t")).toBe("don't");
  });

  it("removes stray decorative glyphs", () => {
    expect(plain("• Age")).toBe("Age");
    expect(plain("2 × 2 table")).toBe("2 x 2 table");
  });

  it("collapses the double spaces its own substitutions create", () => {
    expect(plain("a — b")).toBe("a - b");
  });

  it("handles null and undefined without throwing", () => {
    expect(plain(null)).toBe("");
    expect(plain(undefined)).toBe("");
  });
});

describe("HOUSE_STYLES", () => {
  it("is Times New Roman at 12pt in black", () => {
    const run = HOUSE_STYLES.default!.document!.run!;
    expect(run.font).toBe(HOUSE_FONT);
    expect(HOUSE_FONT).toBe("Times New Roman");
    expect(run.size).toBe(HOUSE_SIZE);
    expect(HOUSE_SIZE).toBe(24); // half-points
    expect(run.color).toBe("000000");
  });
});
