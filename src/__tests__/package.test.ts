import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  files: string[];
  pi: { extensions: string[] };
};

describe("published Pi extension entry", () => {
  it("points pi.extensions at the bundled dist file, not src", () => {
    // `files` only ships dist/ + README.md. Pointing at src/index.ts (as 0.3.0
    // on npm did) means Pi lists the package as installed but never loads it
    // (issues #18 and #21). The build script emits dist/index.js.
    expect(pkg.files).toContain("dist");
    expect(pkg.files).not.toContain("src");
    expect(pkg.pi.extensions).toEqual(["./dist/index.js"]);
  });

  it("keeps every pi.extensions path inside the published files set", () => {
    for (const entry of pkg.pi.extensions) {
      const normalized = normalize(entry).replaceAll("\\", "/");
      const published = pkg.files.some((file) => {
        const prefix = file.replace(/\/$/, "");
        return normalized === prefix || normalized.startsWith(`${prefix}/`);
      });
      expect(published, entry).toBe(true);
    }
  });
});
