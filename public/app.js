const api = {
  async getDiskInfo() {
    if (window.diskCleaner) return window.diskCleaner.getDiskInfo();
    return (await fetch('/api/disk')).json();
  },
  async scan() {
    if (window.diskCleaner) return window.diskCleaner.scan();
    return (await fetch('/api/scan')).json();
  },
  async browse(dirPath) {
    if (window.diskCleaner) return window.diskCleaner.browse(dirPath);
    return (await fetch('/api/browse?path=' + encodeURIComponent(dirPath))).json();
  },
  async deleteItems(items) {
    if (window.diskCleaner) return window.diskCleaner.deleteItems(items);
    return (await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })).json();
  },
};

let scanData = null;
let selectedItems = new Map();

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1000));
  const val = bytes / Math.pow(1000, i);
  return val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2) + ' ' + units[i];
}

function $(id) { return document.getElementById(id); }

function showLoading(show, text) {
  const el = $('loading');
  if (show) {
    el.querySelector('.loading-text').textContent = text || 'Scanning disk...';
    el.classList.add('visible');
  } else {
    el.classList.remove('visible');
  }
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 3500);
}

const SAFETY_MAP = {
  safe:    { label: 'Safe',    cls: 'safety-safe',    dot: 'dot-safe' },
  caution: { label: 'Caution', cls: 'safety-caution', dot: 'dot-caution' },
  danger:  { label: 'Danger',  cls: 'safety-danger',  dot: 'dot-danger' },
};

/* ========== Scan ========== */

async function scan() {
  const btn = $('btn-scan');
  btn.classList.add('scanning');
  showLoading(true, 'Scanning disk...');
  selectedItems.clear();
  updateActionBar();

  try {
    scanData = await api.scan();
    renderStorageOverview(scanData.disk, scanData.categories, scanData.overview || []);
    renderSunburst(scanData);
    renderCategories(scanData.categories);
    $('total-cleanable').textContent = formatSize(scanData.totalCleanable);
    $('placeholder').style.display = 'none';
    $('sunburst').style.display = 'block';
  } catch (e) {
    showToast('Error: ' + e.message);
  }

  showLoading(false);
  btn.classList.remove('scanning');
}

/* ========== Storage Overview Bar ========== */

function renderStorageOverview(disk, categories, overview) {
  $('storage-used').textContent = formatSize(disk.used);
  $('storage-total').textContent = formatSize(disk.total);
  $('storage-free').textContent = formatSize(disk.available);

  const bar = $('storage-bar');
  const breakdown = $('storage-breakdown');
  bar.innerHTML = '';
  breakdown.innerHTML = '';

  const segments = [];

  const minShow = 10 * 1000 * 1000;

  for (const o of overview) {
    if (o.size > minShow) segments.push({ name: o.name, size: o.size, color: o.color });
  }

  const cleanableTotal = categories.reduce((s, c) => s + c.items.reduce((ss, i) => ss + i.size, 0), 0);
  if (cleanableTotal > minShow) {
    segments.push({ name: 'Developer Cache', size: cleanableTotal, color: '#FF6B6B' });
  }

  if (disk.macOSSize > minShow) {
    segments.push({ name: 'macOS', size: disk.macOSSize, color: '#8E8E93' });
  }

  const knownUsed = segments.reduce((s, seg) => s + seg.size, 0);
  const systemData = Math.max(0, disk.used - knownUsed);
  if (systemData > minShow) {
    segments.push({ name: 'System Data', size: systemData, color: '#48484A' });
  }

  segments.sort((a, b) => b.size - a.size);

  for (const seg of segments) {
    const pct = (seg.size / disk.total) * 100;
    if (pct < 0.3) continue;
    const el = document.createElement('div');
    el.className = 'storage-segment';
    el.style.width = pct + '%';
    el.style.background = seg.color;
    el.innerHTML = `<div class="segment-tooltip">${seg.name}: ${formatSize(seg.size)}</div>`;
    bar.appendChild(el);
  }

  const breakdownItems = [
    ...segments,
    { name: 'Available', size: disk.available, color: 'transparent', border: true },
  ];
  for (const item of breakdownItems) {
    const el = document.createElement('div');
    el.className = 'breakdown-item';
    const borderStyle = item.border ? 'border:1.5px solid var(--border-hi);' : '';
    el.innerHTML = `
      <span class="breakdown-dot" style="background:${item.color};${borderStyle}"></span>
      <span class="breakdown-name">${item.name}</span>
      <span class="breakdown-size">${formatSize(item.size)}</span>
    `;
    breakdown.appendChild(el);
  }
}

/* ========== Sunburst ========== */

function renderSunburst(data) {
  const container = $('sunburst-container');
  const width = container.clientWidth;
  const radius = width / 2;

  const svg = d3.select('#sunburst');
  svg.selectAll('*').remove();
  svg.attr('viewBox', `${-width/2} ${-width/2} ${width} ${width}`);

  const defs = svg.append('defs');
  const glowFilter = defs.append('filter').attr('id', 'glow');
  glowFilter.append('feGaussianBlur').attr('stdDeviation', '2').attr('result', 'blur');
  glowFilter.append('feMerge').selectAll('feMergeNode')
    .data(['blur', 'SourceGraphic']).join('feMergeNode').attr('in', d => d);

  const cats = data.categories.filter(c => c.items.reduce((s, i) => s + i.size, 0) > 0);
  if (cats.length === 0) return;

  const hierarchyData = {
    name: 'root',
    children: cats.map(cat => ({
      name: cat.name, color: cat.color, icon: cat.icon, catId: cat.id,
      children: cat.items.map(item => ({
        name: item.name.split('/').pop(),
        fullPath: item.path,
        value: item.size,
        color: cat.color,
        catId: cat.id,
      }))
    }))
  };

  const root = d3.hierarchy(hierarchyData)
    .sum(d => d.value || 0)
    .sort((a, b) => b.value - a.value);

  d3.partition().size([2 * Math.PI, radius * 0.88])(root);

  const inner = radius * 0.22;
  const bandW = (radius * 0.88 - inner) / (root.height || 1);

  const arc = d3.arc()
    .startAngle(d => d.x0)
    .endAngle(d => d.x1)
    .innerRadius(d => inner + (d.depth - 1) * bandW + 2)
    .outerRadius(d => inner + d.depth * bandW - 1)
    .padAngle(0.006)
    .padRadius(radius / 2)
    .cornerRadius(3);

  const centerLabel = $('center-label');

  const paths = svg.selectAll('path')
    .data(root.descendants().filter(d => d.depth > 0))
    .join('path')
    .attr('d', arc)
    .attr('fill', d => {
      const c = d3.color(d.data.color || d.parent?.data.color || '#3b82f6');
      if (d.depth === 2) { c.opacity = 0.55; }
      return c;
    })
    .attr('stroke', 'rgba(12,14,20,0.6)')
    .attr('stroke-width', 1)
    .style('cursor', 'pointer');

  paths.attr('opacity', 0)
    .transition().duration(600).delay((d, i) => i * 8)
    .attr('opacity', 1);

  paths
    .on('mouseover', function(event, d) {
      d3.select(this)
        .attr('filter', 'url(#glow)')
        .attr('fill', d3.color(d.data.color || d.parent?.data.color || '#3b82f6').brighter(0.5));
      const pct = ((d.value / root.value) * 100).toFixed(1);
      centerLabel.style.display = 'block';
      centerLabel.innerHTML = `
        <div class="cl-name">${d.depth === 1 ? (d.data.icon||'') + ' ' : ''}${d.data.name}</div>
        <div class="cl-size">${formatSize(d.value)}</div>
        <div class="cl-pct">${pct}%</div>
      `;
    })
    .on('mouseout', function(event, d) {
      const c = d3.color(d.data.color || d.parent?.data.color || '#3b82f6');
      if (d.depth === 2) c.opacity = 0.55;
      d3.select(this).attr('filter', null).attr('fill', c);
      showCenterDefault(root);
    })
    .on('click', function(event, d) {
      const catId = d.data.catId;
      if (!catId) return;
      const card = document.querySelector(`[data-cat="${catId}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const wrapper = card.querySelector('.cat-items-wrapper');
      const chevron = card.querySelector('.cat-chevron');
      if (wrapper && !wrapper.classList.contains('open')) {
        wrapper.classList.add('open');
        chevron.classList.add('open');
      }
      card.classList.add('highlight');
      setTimeout(() => card.classList.remove('highlight'), 1500);
    });

  showCenterDefault(root);
}

function showCenterDefault(root) {
  const cl = $('center-label');
  cl.style.display = 'block';
  cl.innerHTML = `
    <div class="cl-name">Cleanable</div>
    <div class="cl-size">${formatSize(root.value)}</div>
  `;
}

/* ========== Categories ========== */

function renderCategories(categories) {
  const list = $('categories-list');
  list.innerHTML = '';

  const sorted = [...categories]
    .map(c => ({ ...c, total: c.items.reduce((s, i) => s + i.size, 0) }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const maxSize = sorted[0]?.total || 1;

  sorted.forEach((cat, idx) => {
    const card = document.createElement('div');
    card.className = 'category-card';
    card.dataset.cat = cat.id;
    card.style.animationDelay = `${idx * 40}ms`;

    const barPct = Math.max(4, (cat.total / maxSize) * 100);
    const safety = SAFETY_MAP[cat.safety] || SAFETY_MAP.safe;

    card.innerHTML = `
      <div class="category-header" data-cat-toggle="${cat.id}">
        <span class="cat-icon">${cat.icon}</span>
        <div class="cat-info">
          <div class="cat-name">${cat.name}</div>
          <div class="cat-desc">${cat.description}</div>
        </div>
        <div class="cat-right">
          <span class="safety-badge ${safety.cls}">${safety.label}</span>
          <span class="cat-count">${cat.items.length}</span>
          <span class="cat-size" style="color:${cat.color}">${formatSize(cat.total)}</span>
          <span class="cat-chevron">&#9654;</span>
        </div>
        <div class="cat-bar" style="background:${cat.color};width:${barPct}%"></div>
      </div>
      <div class="cat-items-wrapper" id="wrapper-${cat.id}">
        <div class="cat-items">
          <label class="cat-select-all">
            <input type="checkbox" class="item-check" data-select-all="${cat.id}">
            <span>Select all (${cat.items.length})</span>
          </label>
          ${cat.items.map(item => `
            <div class="cat-item">
              <input type="checkbox" class="item-check"
                data-path="${item.path}"
                data-size="${item.size}"
                data-cat="${cat.id}">
              <span class="item-safety-dot ${safety.dot}"></span>
              <span class="item-name" title="${item.name}">${item.name}</span>
              <span class="item-size">${formatSize(item.size)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

function toggleCategory(id) {
  const wrapper = $('wrapper-' + id);
  if (!wrapper) return;
  const card = wrapper.closest('.category-card');
  const chevron = card.querySelector('.cat-chevron');
  wrapper.classList.toggle('open');
  chevron.classList.toggle('open');
}

function toggleSelectAll(catId, checked) {
  const wrapper = $('wrapper-' + catId);
  if (!wrapper) return;
  const checks = wrapper.querySelectorAll('.cat-item .item-check');
  checks.forEach(cb => {
    cb.checked = checked;
    const p = cb.dataset.path;
    const s = parseInt(cb.dataset.size);
    if (checked) selectedItems.set(p, { size: s });
    else selectedItems.delete(p);
  });
  updateActionBar();
}

function toggleItem(checkbox) {
  const p = checkbox.dataset.path;
  const s = parseInt(checkbox.dataset.size);
  if (checkbox.checked) selectedItems.set(p, { size: s });
  else selectedItems.delete(p);

  const catId = checkbox.dataset.cat;
  const wrapper = $('wrapper-' + catId);
  if (wrapper) {
    const allChecks = wrapper.querySelectorAll('.cat-item .item-check');
    const allLabel = wrapper.querySelector('.cat-select-all .item-check');
    if (allLabel) {
      const total = allChecks.length;
      const numChecked = [...allChecks].filter(c => c.checked).length;
      allLabel.checked = numChecked === total;
      allLabel.indeterminate = numChecked > 0 && numChecked < total;
    }
  }
  updateActionBar();
}

function updateActionBar() {
  const bar = $('action-bar');
  if (selectedItems.size === 0) {
    bar.classList.remove('visible');
    return;
  }
  bar.classList.add('visible');
  let total = 0;
  selectedItems.forEach(v => total += v.size);
  $('selected-size').textContent = formatSize(total);
  $('selected-count').textContent = selectedItems.size;
}

/* ========== Delete with per-item progress ========== */

function deleteSelected() {
  if (selectedItems.size === 0) return;
  let total = 0;
  selectedItems.forEach(v => total += v.size);

  $('modal-text').innerHTML =
    `Delete <strong>${selectedItems.size}</strong> items totaling <strong>${formatSize(total)}</strong>?<br><span style="color:var(--text-mute)">This cannot be undone.</span>`;
  $('modal-overlay').classList.add('visible');
}

function closeModal() {
  $('modal-overlay').classList.remove('visible');
}

async function confirmDelete() {
  closeModal();

  const items = [...selectedItems.entries()].map(([path, info]) => ({
    path,
    size: info.size,
    name: path.replace(/^\/Users\/[^/]+/, '~'),
  }));

  const overlay = $('progress-overlay');
  const itemsEl = $('progress-items');
  const fill = $('progress-fill');
  const summary = $('progress-summary');
  const doneBtn = $('btn-progress-done');
  const title = $('progress-title');

  title.textContent = `Deleting ${items.length} items...`;
  fill.style.width = '0%';
  fill.style.background = '';
  summary.textContent = '';
  doneBtn.style.display = 'none';

  itemsEl.innerHTML = items.map((item, i) => `
    <div class="progress-item" id="pi-${i}">
      <span class="pi-icon pending">○</span>
      <span class="pi-name" title="${item.name}">${item.name}</span>
      <span class="pi-status">${formatSize(item.size)}</span>
    </div>
  `).join('');

  overlay.classList.add('visible');

  let freedTotal = 0;
  let errorCount = 0;

  for (let i = 0; i < items.length; i++) {
    const el = $('pi-' + i);
    const icon = el.querySelector('.pi-icon');
    const status = el.querySelector('.pi-status');

    icon.className = 'pi-icon active';
    icon.textContent = '↻';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const result = await api.deleteItems([items[i].path]);
      const r = result.results?.[0];
      if (r?.success) {
        icon.className = 'pi-icon done';
        icon.textContent = '✓';
        freedTotal += items[i].size;
      } else {
        icon.className = 'pi-icon error';
        icon.textContent = '✗';
        status.className = 'pi-status error';
        status.textContent = r?.error || 'Failed';
        errorCount++;
      }
    } catch (e) {
      icon.className = 'pi-icon error';
      icon.textContent = '✗';
      status.className = 'pi-status error';
      status.textContent = e.message;
      errorCount++;
    }

    fill.style.width = ((i + 1) / items.length * 100) + '%';
    summary.textContent = `Freed ${formatSize(freedTotal)}` + (errorCount ? ` — ${errorCount} failed` : '');
  }

  title.textContent = errorCount
    ? `Done — ${items.length - errorCount} deleted, ${errorCount} failed`
    : `Done — freed ${formatSize(freedTotal)}`;
  fill.style.background = errorCount ? 'var(--orange)' : 'var(--green)';
  doneBtn.style.display = 'inline-block';

  selectedItems.clear();
  updateActionBar();
}

async function closeProgress() {
  $('progress-overlay').classList.remove('visible');
  showLoading(true, 'Rescanning...');
  await scan();
}

/* ========== Event listeners ========== */

$('btn-scan').addEventListener('click', () => scan());
$('btn-delete').addEventListener('click', () => deleteSelected());
$('btn-cancel').addEventListener('click', () => closeModal());
$('btn-confirm').addEventListener('click', () => confirmDelete());
$('btn-progress-done').addEventListener('click', () => closeProgress());

$('categories-list').addEventListener('click', e => {
  const header = e.target.closest('[data-cat-toggle]');
  if (header) {
    toggleCategory(header.dataset.catToggle);
    return;
  }

  const selectAll = e.target.closest('[data-select-all]');
  if (selectAll && selectAll.tagName === 'INPUT') {
    toggleSelectAll(selectAll.dataset.selectAll, selectAll.checked);
    return;
  }
});

$('categories-list').addEventListener('change', e => {
  if (e.target.dataset.path) {
    toggleItem(e.target);
  }
});

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
    e.preventDefault();
    scan();
  }
  if (e.key === 'Escape') {
    if ($('modal-overlay').classList.contains('visible')) closeModal();
    if ($('progress-overlay').classList.contains('visible')) closeProgress();
  }
});

window.addEventListener('resize', () => {
  if (scanData) renderSunburst(scanData);
});

if (window.diskCleaner?.onMenuScan) {
  window.diskCleaner.onMenuScan(() => scan());
}

/* Auto-scan on launch */
scan();
