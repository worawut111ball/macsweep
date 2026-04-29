const { execFileSync, execFile: execFileCb } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const os = require('os');

const execFile = promisify(execFileCb);
const HOME = os.homedir();

const ALLOWED_PREFIXES = [
  path.join(HOME, 'artron'),
  path.join(HOME, 'my-project'),
  path.join(HOME, 'development'),
  path.join(HOME, 'ghq'),
  path.join(HOME, '.npm'),
  path.join(HOME, '.cache'),
  path.join(HOME, '.platformio'),
  path.join(HOME, '.nvm'),
  path.join(HOME, '.pub-cache'),
  path.join(HOME, '.gemini'),
  path.join(HOME, '.codex'),
  path.join(HOME, '.bun'),
  path.join(HOME, '.dartServer'),
  path.join(HOME, '.Trash'),
  path.join(HOME, 'Library', 'pnpm'),
  path.join(HOME, 'Library', 'Caches'),
  path.join(HOME, 'Library', 'Logs'),
  path.join(HOME, 'Library', 'Developer', 'Xcode'),
  path.join(HOME, 'Library', 'Application Support', 'discord'),
  path.join(HOME, 'Library', 'Application Support', 'Zed', 'node'),
  path.join(HOME, 'Library', 'Application Support', 'Zed', 'languages'),
  path.join(HOME, 'Library', 'Application Support', 'Zed', 'hang_traces'),
];

function isAllowedPath(target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(HOME + path.sep) && resolved !== HOME) return false;
  return ALLOWED_PREFIXES.some(prefix => resolved === prefix || resolved.startsWith(prefix + path.sep));
}

function getDiskInfo() {
  const rootInfo = execFileSync('diskutil', ['info', '/']).toString();
  const parseBytes = (label) => {
    const m = rootInfo.match(new RegExp(label + ':\\s+[\\d.]+ \\w+ \\((\\d+) Bytes\\)'));
    return m ? parseInt(m[1]) : 0;
  };
  const total = parseBytes('Container Total Space');
  const available = parseBytes('Container Free Space');
  const macOSSize = parseBytes('Volume Used Space');

  let preboot = 0;
  try {
    const pbInfo = execFileSync('diskutil', ['info', '/System/Volumes/Preboot']).toString();
    const m = pbInfo.match(/Volume Used Space:\s+[\d.]+ \w+ \((\d+) Bytes\)/);
    if (m) preboot = parseInt(m[1]);
  } catch {}

  const used = total - available - preboot;
  return { total, used, available: total - used, macOSSize };
}

async function getDirSize(dirPath) {
  const resolved = path.resolve(dirPath);
  try {
    const { stdout } = await execFile('du', ['-sk', resolved], { timeout: 30000 });
    return parseInt(stdout.trim().split('\t')[0]) * 1024;
  } catch (e) {
    if (e.stdout) {
      const val = parseInt(e.stdout.trim().split('\t')[0]);
      if (!isNaN(val)) return val * 1024;
    }
    return 0;
  }
}

async function getChildSizes(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const tasks = entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const size = await getDirSize(fullPath);
        if (size > 1024 * 1024) return { name: entry.name, path: fullPath, size, isDir: true };
      } else {
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > 1024 * 1024) return { name: entry.name, path: fullPath, size: stats.size, isDir: false };
        } catch {}
      }
      return null;
    });
    const results = (await Promise.all(tasks)).filter(Boolean);
    return results.sort((a, b) => b.size - a.size);
  } catch {
    return [];
  }
}

async function findItems(pattern, basePaths, maxDepth = 4) {
  const findTasks = basePaths.map(async (base) => {
    try {
      const findArgs = [base, '-maxdepth', String(maxDepth), '-name', pattern, '-type', 'd'];
      if (pattern === 'node_modules') findArgs.push('-prune');
      findArgs.push('-print0');
      const { stdout } = await execFile('find', findArgs);
      return stdout.split('\0').filter(Boolean);
    } catch {
      return [];
    }
  });
  const allPaths = (await Promise.all(findTasks)).flat();
  if (allPaths.length === 0) return [];

  const sized = await Promise.all(allPaths.map(async (p) => {
    const size = await getDirSize(p);
    return size > 0 ? { name: p.replace(HOME, '~'), path: p, size } : null;
  }));
  return sized.filter(Boolean).sort((a, b) => b.size - a.size);
}

async function scan() {
  const projectPaths = [
    path.join(HOME, 'artron'),
    path.join(HOME, 'my-project'),
    path.join(HOME, 'development'),
    path.join(HOME, 'ghq'),
  ].filter(p => fs.existsSync(p));

  const singlePaths = [
    path.join(HOME, '.npm'),
    path.join(HOME, '.cache'),
    path.join(HOME, '.platformio'),
    path.join(HOME, '.nvm'),
    path.join(HOME, '.pub-cache'),
    path.join(HOME, '.gemini'),
    path.join(HOME, '.codex'),
    path.join(HOME, '.bun'),
    path.join(HOME, '.dartServer'),
    path.join(HOME, 'Library/pnpm'),
    path.join(HOME, 'Library/Caches/pip'),
    path.join(HOME, 'Library/Caches/ms-playwright'),
    path.join(HOME, 'Library/Caches/ms-playwright-go'),
    path.join(HOME, 'Library/Caches/Google'),
    path.join(HOME, 'Library/Developer/Xcode/DerivedData'),
    path.join(HOME, 'Library/Developer/Xcode/iOS DeviceSupport'),
    path.join(HOME, '.Trash'),
    path.join(HOME, 'Library/Logs'),
    path.join(HOME, 'Library/Application Support/Zed/node'),
    path.join(HOME, 'Library/Application Support/Zed/languages'),
    path.join(HOME, 'Library/Application Support/Zed/hang_traces'),
  ];

  const discordPath = path.join(HOME, 'Library/Application Support/discord');
  let discordCachePaths = [];
  try {
    discordCachePaths = fs.readdirSync(discordPath, { withFileTypes: true })
      .filter(e => e.isDirectory() && (e.name.includes('Cache') || e.name.includes('cache')))
      .map(e => path.join(discordPath, e.name));
  } catch {}

  const cachesDir = path.join(HOME, 'Library/Caches');
  const skipCaches = ['Google', 'Homebrew', 'pip', 'ms-playwright', 'ms-playwright-go', 'pnpm', 'node-gyp', 'typescript', 'com.openai.codex'];
  let miscCachePaths = [];
  try {
    miscCachePaths = fs.readdirSync(cachesDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !skipCaches.includes(e.name))
      .map(e => path.join(cachesDir, e.name));
  } catch {}

  const allDuPaths = [...singlePaths, ...discordCachePaths, ...miscCachePaths];

  const overviewEntries = [
    { name: 'Applications', color: '#007AFF', path: '/Applications' },
    { name: 'Documents', color: '#5856D6', path: path.join(HOME, 'Documents') },
    { name: 'Downloads', color: '#34C759', path: path.join(HOME, 'Downloads') },
    { name: 'Desktop', color: '#FF9500', path: path.join(HOME, 'Desktop') },
    { name: 'Pictures', color: '#FF2D55', path: path.join(HOME, 'Pictures') },
    { name: 'Music', color: '#AF52DE', path: path.join(HOME, 'Music') },
    { name: 'Movies', color: '#FF375F', path: path.join(HOME, 'Movies') },
  ].filter(o => fs.existsSync(o.path));
  const overviewDuPaths = overviewEntries.map(o => o.path);

  const appExtraPaths = [
    path.join(HOME, 'Applications'),
    path.join(HOME, 'Library', 'Application Support'),
  ].filter(p => fs.existsSync(p));

  const systemExtraPaths = ['/Library', '/private/var'].filter(p => fs.existsSync(p));

  const brewCachePromise = (async () => {
    try {
      const { stdout } = await execFile('brew', ['--cache']);
      const p = stdout.trim();
      const size = await getDirSize(p);
      return { path: p, size };
    } catch { return null; }
  })();

  const dockerPromise = (async () => {
    try {
      const { stdout } = await execFile('docker', ['system', 'df', '--format', '{{json .}}'], { timeout: 10000 });
      const parseDockerSize = (s) => {
        const m = String(s).match(/([\d.]+)\s*(B|KB|MB|GB|TB|kB)/);
        if (!m) return 0;
        const val = parseFloat(m[1]);
        const units = { B: 1, kB: 1e3, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };
        return Math.round(val * (units[m[2]] || 1));
      };
      const items = [];
      for (const line of stdout.trim().split('\n')) {
        const row = JSON.parse(line);
        const reclaimable = parseDockerSize(row.Reclaimable);
        if (reclaimable > 1024 * 1024) {
          items.push({ name: 'Docker ' + row.Type, size: reclaimable, type: row.Type });
        }
      }
      return items;
    } catch { return []; }
  })();

  const [nodeModuleItems, nextCacheItems, brewCache, dockerItems, ...allSizes] = await Promise.all([
    findItems('node_modules', projectPaths, 4),
    findItems('.next', projectPaths, 4),
    brewCachePromise,
    dockerPromise,
    ...allDuPaths.map(p => getDirSize(p)),
    ...overviewDuPaths.map(p => getDirSize(p)),
    ...appExtraPaths.map(p => getDirSize(p)),
    ...systemExtraPaths.map(p => getDirSize(p)),
    ...projectPaths.map(p => getDirSize(p)),
  ]);

  const sizes = allSizes.slice(0, allDuPaths.length);
  const overviewSizes = allSizes.slice(allDuPaths.length, allDuPaths.length + overviewDuPaths.length);
  const appExtraSizes = allSizes.slice(
    allDuPaths.length + overviewDuPaths.length,
    allDuPaths.length + overviewDuPaths.length + appExtraPaths.length
  );
  const sysStart = allDuPaths.length + overviewDuPaths.length + appExtraPaths.length;
  const systemExtraTotal = allSizes
    .slice(sysStart, sysStart + systemExtraPaths.length)
    .reduce((s, v) => s + v, 0);
  const projectDirSizes = allSizes.slice(sysStart + systemExtraPaths.length);

  const appsIdx = overviewEntries.findIndex(o => o.name === 'Applications');
  if (appsIdx >= 0) overviewSizes[appsIdx] += appExtraSizes.reduce((s, v) => s + v, 0);

  const sizeMap = new Map();
  allDuPaths.forEach((p, i) => sizeMap.set(p, sizes[i]));
  const sz = (p) => sizeMap.get(p) || 0;

  const categories = [
    {
      id: 'node_modules', name: 'node_modules', icon: '📦', color: '#FF6B6B',
      description: 'Node.js dependencies — ลบแล้ว npm install ใหม่ได้',
      items: nodeModuleItems, safety: 'safe',
    },
    {
      id: 'next_cache', name: '.next Build Cache', icon: '⚡', color: '#4ECDC4',
      description: 'Next.js build cache — ลบแล้ว build ใหม่ได้',
      items: nextCacheItems, safety: 'safe',
    },
    {
      id: 'npm_cache', name: 'npm / pnpm Cache', icon: '📋', color: '#45B7D1',
      description: 'npm + pnpm global cache',
      items: [
        { name: '~/.npm', path: path.join(HOME, '.npm'), size: sz(path.join(HOME, '.npm')) },
        { name: '~/Library/pnpm', path: path.join(HOME, 'Library/pnpm'), size: sz(path.join(HOME, 'Library/pnpm')) },
      ].filter(i => i.size > 0),
      safety: 'safe',
    },
    {
      id: 'brew_cache', name: 'Homebrew Cache', icon: '🍺', color: '#96CEB4',
      description: 'Homebrew download cache',
      items: brewCache && brewCache.size > 0
        ? [{ name: '~/Library/Caches/Homebrew', path: brewCache.path, size: brewCache.size }]
        : [],
      safety: 'safe',
    },
    {
      id: 'pip_cache', name: 'pip Cache', icon: '🐍', color: '#FFEAA7',
      description: 'Python pip cache',
      items: [{ name: '~/Library/Caches/pip', path: path.join(HOME, 'Library/Caches/pip'), size: sz(path.join(HOME, 'Library/Caches/pip')) }].filter(i => i.size > 0),
      safety: 'safe',
    },
    {
      id: 'platformio', name: 'PlatformIO', icon: '🔌', color: '#E17055',
      description: 'PlatformIO toolchains & libraries',
      items: [{ name: '~/.platformio', path: path.join(HOME, '.platformio'), size: sz(path.join(HOME, '.platformio')) }].filter(i => i.size > 0),
      safety: 'caution',
    },
    {
      id: 'generic_cache', name: 'Generic Cache', icon: '🗄️', color: '#636E72',
      description: 'Cache ทั่วไป (~/.cache)',
      items: [{ name: '~/.cache', path: path.join(HOME, '.cache'), size: sz(path.join(HOME, '.cache')) }].filter(i => i.size > 0),
      safety: 'safe',
    },
    {
      id: 'nvm', name: 'Node Versions (nvm)', icon: '🟢', color: '#00B894',
      description: 'Node.js versions ที่ติดตั้งผ่าน nvm',
      items: [{ name: '~/.nvm', path: path.join(HOME, '.nvm'), size: sz(path.join(HOME, '.nvm')) }].filter(i => i.size > 0),
      safety: 'caution',
    },
    {
      id: 'pub_cache', name: 'Dart/Flutter Cache', icon: '🎯', color: '#0984E3',
      description: 'Dart pub cache — ลบแล้ว pub get ใหม่ได้',
      items: [{ name: '~/.pub-cache', path: path.join(HOME, '.pub-cache'), size: sz(path.join(HOME, '.pub-cache')) }].filter(i => i.size > 0),
      safety: 'safe',
    },
    {
      id: 'playwright', name: 'Playwright Browsers', icon: '🎭', color: '#DDA0DD',
      description: 'Playwright test browsers — ลบได้ถ้าไม่ได้ใช้ e2e test',
      items: [
        { name: '~/Library/Caches/ms-playwright', path: path.join(HOME, 'Library/Caches/ms-playwright'), size: sz(path.join(HOME, 'Library/Caches/ms-playwright')) },
        { name: '~/Library/Caches/ms-playwright-go', path: path.join(HOME, 'Library/Caches/ms-playwright-go'), size: sz(path.join(HOME, 'Library/Caches/ms-playwright-go')) },
      ].filter(i => i.size > 0),
      safety: 'safe',
    },
    {
      id: 'chrome_cache', name: 'Chrome Cache', icon: '🌐', color: '#74B9FF',
      description: 'Google Chrome browser cache',
      items: [{ name: '~/Library/Caches/Google', path: path.join(HOME, 'Library/Caches/Google'), size: sz(path.join(HOME, 'Library/Caches/Google')) }].filter(i => i.size > 0),
      safety: 'safe',
    },
    {
      id: 'discord_cache', name: 'Discord Cache', icon: '💬', color: '#A29BFE',
      description: 'Discord app cache',
      items: discordCachePaths
        .map(p => ({ name: p.replace(HOME, '~'), path: p, size: sz(p) }))
        .filter(i => i.size > 0),
      safety: 'safe',
    },
    {
      id: 'ai_tools', name: 'AI Tool Caches', icon: '🤖', color: '#6C5CE7',
      description: 'Gemini CLI, Codex CLI cache — ลบแล้วจะ re-download',
      items: [
        { name: '~/.gemini', path: path.join(HOME, '.gemini'), size: sz(path.join(HOME, '.gemini')) },
        { name: '~/.codex', path: path.join(HOME, '.codex'), size: sz(path.join(HOME, '.codex')) },
      ].filter(i => i.size > 0),
      safety: 'safe',
    },
    {
      id: 'zed_cache', name: 'Zed Editor Cache', icon: '⚡', color: '#F39C12',
      description: 'Zed LSP servers, grammars, traces — ลบแล้ว Zed จะโหลดใหม่',
      items: [
        { name: 'Zed/node (LSP)', path: path.join(HOME, 'Library/Application Support/Zed/node'), size: sz(path.join(HOME, 'Library/Application Support/Zed/node')) },
        { name: 'Zed/languages', path: path.join(HOME, 'Library/Application Support/Zed/languages'), size: sz(path.join(HOME, 'Library/Application Support/Zed/languages')) },
        { name: 'Zed/hang_traces', path: path.join(HOME, 'Library/Application Support/Zed/hang_traces'), size: sz(path.join(HOME, 'Library/Application Support/Zed/hang_traces')) },
      ].filter(i => i.size > 0),
      safety: 'safe',
    },
    {
      id: 'bun_dart', name: 'Bun / Dart Server', icon: '🥟', color: '#FDCB6E',
      description: 'Bun install cache + Dart analysis server',
      items: [
        { name: '~/.bun', path: path.join(HOME, '.bun'), size: sz(path.join(HOME, '.bun')) },
        { name: '~/.dartServer', path: path.join(HOME, '.dartServer'), size: sz(path.join(HOME, '.dartServer')) },
      ].filter(i => i.size > 0),
      safety: 'safe',
    },
    {
      id: 'docker', name: 'Docker', icon: '🐳', color: '#0DB7ED',
      description: 'Docker build cache + unused images — ใช้ docker prune',
      items: dockerItems.map(d => ({
        name: d.name, path: '__docker__' + d.type, size: d.size,
      })),
      safety: 'caution',
    },
    {
      id: 'xcode', name: 'Xcode Data', icon: '🔨', color: '#FD79A8',
      description: 'Xcode DerivedData & device support',
      items: [
        { name: '~/Library/Developer/Xcode/DerivedData', path: path.join(HOME, 'Library/Developer/Xcode/DerivedData'), size: sz(path.join(HOME, 'Library/Developer/Xcode/DerivedData')) },
        { name: '~/Library/Developer/Xcode/iOS DeviceSupport', path: path.join(HOME, 'Library/Developer/Xcode/iOS DeviceSupport'), size: sz(path.join(HOME, 'Library/Developer/Xcode/iOS DeviceSupport')) },
      ].filter(i => i.size > 0),
      safety: 'caution',
    },
    {
      id: 'trash', name: 'Trash', icon: '🗑️', color: '#636E72',
      description: 'ถังขยะ macOS',
      items: [{ name: '~/.Trash', path: path.join(HOME, '.Trash'), size: sz(path.join(HOME, '.Trash')) }].filter(i => i.size > 0),
      safety: 'safe',
    },
    {
      id: 'logs', name: 'System Logs', icon: '📝', color: '#B2BEC3',
      description: 'Log files ของระบบและแอป',
      items: [{ name: '~/Library/Logs', path: path.join(HOME, 'Library/Logs'), size: sz(path.join(HOME, 'Library/Logs')) }].filter(i => i.size > 0),
      safety: 'caution',
    },
    {
      id: 'misc_cache', name: 'Other Caches', icon: '📁', color: '#FDCB6E',
      description: 'Cache อื่นๆ ใน Library',
      items: miscCachePaths
        .map(p => ({ name: p.replace(HOME, '~'), path: p, size: sz(p) }))
        .filter(i => i.size > 5 * 1024 * 1024)
        .sort((a, b) => b.size - a.size),
      safety: 'danger',
    },
  ];

  const totalCleanable = categories.reduce((sum, cat) => {
    return sum + cat.items.reduce((s, i) => s + i.size, 0);
  }, 0);

  const overview = overviewEntries
    .map((o, i) => ({ name: o.name, color: o.color, size: overviewSizes[i] }))
    .filter(o => o.size > 0);

  const projectsTotal = projectDirSizes.reduce((s, v) => s + v, 0);
  const nmInProjects = nodeModuleItems.reduce((s, i) => s + i.size, 0);
  const nextInProjects = nextCacheItems.reduce((s, i) => s + i.size, 0);
  const projectsNet = projectsTotal - nmInProjects - nextInProjects;
  if (projectsNet > 10 * 1e6) {
    overview.push({ name: 'Projects', color: '#00CEC9', size: projectsNet });
  }

  const disk = getDiskInfo();
  disk.macOSSize += systemExtraTotal;
  return { categories, totalCleanable, disk, overview };
}

async function browse(dirPath) {
  const resolved = path.resolve(dirPath);
  if (!isAllowedPath(resolved)) {
    return { error: 'Path not in allowed scope' };
  }
  if (!fs.existsSync(resolved)) {
    return { error: 'Path does not exist' };
  }
  const [children, total] = await Promise.all([
    getChildSizes(resolved),
    getDirSize(resolved),
  ]);
  return { path: resolved, total, children };
}

async function deleteItems(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { error: 'No items specified' };
  }
  if (items.length > 50) {
    return { error: 'Too many items (max 50)' };
  }

  const results = [];
  for (const item of items) {
    if (typeof item !== 'string') {
      results.push({ path: String(item), error: 'Invalid path type' });
      continue;
    }

    if (item.startsWith('__docker__')) {
      try {
        const type = item.replace('__docker__', '');
        if (type === 'Build Cache') {
          await execFile('docker', ['builder', 'prune', '-af'], { timeout: 60000 });
        } else if (type === 'Images') {
          await execFile('docker', ['image', 'prune', '-af'], { timeout: 60000 });
        } else if (type === 'Containers') {
          await execFile('docker', ['container', 'prune', '-f'], { timeout: 60000 });
        } else if (type === 'Local Volumes') {
          await execFile('docker', ['volume', 'prune', '-af'], { timeout: 60000 });
        }
        results.push({ path: item, success: true });
      } catch (e) {
        results.push({ path: item, error: e.message || 'Docker prune failed' });
      }
      continue;
    }

    const resolved = path.resolve(item);
    if (!isAllowedPath(resolved)) {
      results.push({ path: item, error: 'Path not in allowed scope' });
      continue;
    }
    if (!fs.existsSync(resolved)) {
      results.push({ path: item, success: true, note: 'Already gone' });
      continue;
    }
    try {
      const stat = fs.lstatSync(resolved);
      if (stat.isDirectory()) {
        fs.rmSync(resolved, { recursive: true, force: true });
      } else {
        fs.unlinkSync(resolved);
      }
      results.push({ path: item, success: true });
    } catch (e) {
      results.push({ path: item, error: e.message });
    }
  }
  return { results };
}

module.exports = { getDiskInfo, scan, browse, deleteItems, isAllowedPath, HOME };
