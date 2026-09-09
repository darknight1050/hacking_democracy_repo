/** Compatibility entry point; the isolated numerical experiment lives in Python. */
import { spawnSync } from 'node:child_process';
const result = spawnSync('python3', ['scripts/simulation/run.py'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
