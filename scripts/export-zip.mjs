import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const root = process.cwd();
const projectName = path.basename(root);
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const outputZip = path.join(root, `${projectName}_${stamp}.zip`);
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rtliga-export-'));
const stageBase = path.join(tempRoot, 'stage');
const stageProject = path.join(stageBase, projectName);

const excludedNames = new Set([
  'node_modules',
  'dist',
  '.git',
  '.DS_Store',
]);

async function copyFiltered(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (excludedNames.has(entry.name)) continue;
    if (entry.name.endsWith('.zip')) continue;

    if (entry.isDirectory()) {
      await copyFiltered(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

try {
  await fs.rm(outputZip, { force: true });
  await fs.mkdir(stageBase, { recursive: true });
  await copyFiltered(root, stageProject);

  if (process.platform === 'win32') {
    const escapedStage = stageProject.replace(/'/g, "''");
    const escapedZip = outputZip.replace(/'/g, "''");
    const script = `Compress-Archive -Path '${escapedStage}' -DestinationPath '${escapedZip}' -Force`;
    await run('powershell', ['-NoProfile', '-Command', script]);
  } else {
    await run('zip', ['-rq', outputZip, projectName], { cwd: stageBase });
  }

  console.log(`ZIP erstellt: ${outputZip}`);
  console.log('Ausgeschlossen: node_modules, dist, .git');
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
