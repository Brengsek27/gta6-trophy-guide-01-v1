import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const chrome = [
  '/home/hatch/.cache/puppeteer/chrome/linux-157.0.8103.50/chrome-linux64/chrome',
  '/opt/meta-chromium/chrome',
].find(existsSync);
if (!chrome) throw new Error('No supported cached Chrome installation found.');
const scenes = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const scratch = mkdtempSync(join(tmpdir(), 'leonida-capture-'));
const screenshotDirectory = join(root, 'screenshots');
mkdirSync(screenshotDirectory, { recursive: true });
const children = new Set();

async function freePort() {
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 45000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      children.delete(child);
      if (code !== 0) reject(new Error(`${basename(command)} failed (${code}): ${stderr.slice(-3000)}`));
      else resolve({ stdout, stderr });
    });
  });
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['serve.ts', '--port', String(port)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
children.add(server);
let serverErrors = '';
server.stderr.on('data', (chunk) => {
  serverErrors += chunk;
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(origin);
      ready = response.ok;
      if (ready) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Development server did not start: ${serverErrors}`);
  for (const [index, scene] of scenes.entries()) {
    const target = new URL(scene.path + (scene.query ?? ''), origin);
    if (scene.grade && !target.searchParams.has('grade')) target.searchParams.set('grade', scene.grade);
    if (scene.scroll) target.searchParams.set('scroll', String(scene.scroll));
    const png = join(scratch, `${index}.png`);
    const profile = join(scratch, `chrome-${index}`);
    const { stdout, stderr } = await run(chrome, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--metrics-recording-only',
      '--force-device-scale-factor=1',
      '--enable-logging=stderr',
      '--log-level=0',
      '--run-all-compositor-stages-before-draw',
      `--user-data-dir=${profile}`,
      `--window-size=${scene.viewport.width},${scene.viewport.height}`,
      '--virtual-time-budget=9000',
      `--screenshot=${png}`,
      '--dump-dom',
      target.href,
    ]);
    if (!stdout.includes('data-atlas-ready="true"'))
      throw new Error(`${scene.file}: app did not finish rendering.`);
    const consoleErrors = stderr
      .split('\n')
      .filter((line) => /CONSOLE.*(?:Uncaught|Error:|TypeError|SyntaxError|ReferenceError)/i.test(line));
    if (consoleErrors.length)
      throw new Error(`${scene.file}: browser console errors:\n${consoleErrors.join('\n')}`);
    const image = readFileSync(png);
    if (image.length < 25000)
      throw new Error(`${scene.file}: suspiciously small PNG (${image.length} bytes).`);
    const width = image.readUInt32BE(16);
    const height = image.readUInt32BE(20);
    if (width !== scene.viewport.width || height !== scene.viewport.height)
      throw new Error(`${scene.file}: unexpected ${width}x${height} dimensions.`);
    const destination = join(screenshotDirectory, scene.file);
    let quality = 3;
    do {
      await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-q:v', String(quality), destination]);
      if (statSync(destination).size <= 262144) break;
      quality += 2;
    } while (quality <= 31);
    const bytes = statSync(destination).size;
    if (bytes > 262144) throw new Error(`${scene.file} exceeds the screenshot byte cap.`);
    console.log(
      `${scene.file}: ${bytes} bytes · ${width}x${height} · PNG ${image.length} bytes · console clean`,
    );
  }
} finally {
  for (const child of children) child.kill('SIGTERM');
  await new Promise((resolve) => (server.exitCode !== null ? resolve() : server.once('close', resolve)));
  rmSync(scratch, { recursive: true, force: true });
}
