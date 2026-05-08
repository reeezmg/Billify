const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const [, , command, ...args] = process.argv;

if (!command) {
  console.error('Usage: node scripts/without-electron-run-as-node.cjs <command> [...args]');
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

function resolvePackageBin(packageName, binName) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binName];

  if (!bin) {
    throw new Error(`Could not find bin "${binName}" in ${packageName}`);
  }

  return path.resolve(path.dirname(packageJsonPath), bin);
}

let binPath;

try {
  binPath = resolvePackageBin(command, command);
} catch (error) {
  console.error(error);
  process.exit(1);
}

const child = spawn(process.execPath, [binPath, ...args], {
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
