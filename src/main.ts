import 'dotenv/config'; // .env を読み込む
import * as path from 'path';
import { spawnSync } from 'child_process';

function main() {
  const args = process.argv.slice(2);
  // dist 配下の runner.js を同期実行
  const runnerPath = path.join(__dirname, 'runner.js');
  const res = spawnSync(process.execPath, [runnerPath, ...args], {
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

main();
