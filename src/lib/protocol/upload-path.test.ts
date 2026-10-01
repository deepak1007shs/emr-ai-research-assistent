import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, ownsPath, uploadPath } from "./upload-path";

const user = "00b34f21-daf9-498b-b718-49e030bdf86e";
const other = "57317a99-3e35-4828-b244-c49553cb10e9";

describe("uploadPath", () => {
  it("puts the file in the uploader's own folder, under a fresh id", () => {
    expect(uploadPath(user, "u1", "Thesis Protocol.pdf")).toBe(
      `${user}/uploads/u1/Thesis Protocol.pdf`,
    );
  });

  it("keeps a slash in the name from opening another folder", () => {
    expect(uploadPath(user, "u1", "../../x/evil.pdf")).toBe(`${user}/uploads/u1/.._.._x_evil.pdf`);
  });

  it("produces a path its owner passes", () => {
    expect(ownsPath(user, uploadPath(user, "u1", "a.pdf"))).toBe(true);
  });
});

describe("ownsPath", () => {
  it("refuses a path in another user's folder", () => {
    expect(ownsPath(user, `${other}/uploads/u1/a.pdf`)).toBe(false);
  });

  it("refuses a path that climbs out of the folder", () => {
    expect(ownsPath(user, `${user}/uploads/../../${other}/a.pdf`)).toBe(false);
  });

  it("refuses a path that only starts with the id", () => {
    expect(ownsPath(user, `${user}x/uploads/u1/a.pdf`)).toBe(false);
  });

  it("refuses anything that is not a string", () => {
    expect(ownsPath(user, undefined)).toBe(false);
    expect(ownsPath(user, 42)).toBe(false);
  });
});

describe("MAX_UPLOAD_BYTES", () => {
  it("stays under the storage bucket's 25 MB limit", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(25 * 1024 * 1024);
  });
});
