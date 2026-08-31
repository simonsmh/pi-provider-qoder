import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Give every test file its own HOME.
 *
 * The provider stores credentials and the model catalog under
 * `~/.pi/agent/*.json`, and several suites write those paths. Vitest runs test
 * files in parallel, so a shared HOME let one file truncate a file another was
 * reading (an intermittent failure in the stream suite). A per-file HOME also
 * keeps the suite from touching the real `~/.pi` of whoever runs it.
 */
const home = mkdtempSync(join(tmpdir(), "pi-provider-qoder-test-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
mkdirSync(join(home, ".pi", "agent"), { recursive: true });
