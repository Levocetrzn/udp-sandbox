/* ═══════════════════════════════════════════════════════════════
   UDP-Scope — app.js (Enterprise NOC Suite v3.4)
   Professional Network Protocol Simulation, Topology & Workspace
   ═══════════════════════════════════════════════════════════════ */
'use strict';

// ── Helpers ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const rand = (a, b) => Math.random() * (b - a) + a;
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(2)} MB`;
}

function hexByte(n) { return (n & 0xFF).toString(16).padStart(2,'0').toUpperCase(); }
function hex16(n)   { return '0x' + (n & 0xFFFF).toString(16).padStart(4,'0').toUpperCase(); }
function bin16(n)   {
  const s = (n & 0xFFFF).toString(2).padStart(16,'0');
  return `${s.slice(0,4)} ${s.slice(4,8)} ${s.slice(8,12)} ${s.slice(12,16)}`;
}

function calcChecksum(str) {
  let s = 0;
  for (let i = 0; i < str.length; i++) s = (s + str.charCodeAt(i)) & 0xFFFF;
  return '0x' + s.toString(16).toUpperCase().padStart(4,'0');
}

// ── Smooth roundRect polyfill ─────────────────────────
function rRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
}

// ── Global Network Node Renderer (Restores missing drawNetNode) ────
function drawNetNode(ctx, x, y, icon, col, title, subtitle) {
  if (!ctx) return;
  ctx.save();

  // Subtle ambient radial glow behind node
  const grad = ctx.createRadialGradient(x, y, 4, x, y, 24);
  grad.addColorStop(0, (col || '#38bdf8') + '55');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.fill();

  // Cyber node chassis
  ctx.shadowColor = col || '#38bdf8';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#0c1326';
  ctx.strokeStyle = col || '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Icon symbol
  ctx.font = '14px "Segoe UI Emoji", -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon || '💻', x, y + 1);

  // Optional title and subtitle labels
  if (title) {
    ctx.font = 'bold 9px "Inter", monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(title, x, y + 25);
  }
  if (subtitle) {
    ctx.font = '8px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(subtitle, x, y + 35);
  }
  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  GLOBAL STATE
// ══════════════════════════════════════════════════════
const State = {
  packetsSent: 0, packetsReceived: 0, packetsLost: 0, packetsOOO: 0,
  bytesSent: 0, latencies: [], sequenceNum: 0,
  animSpeed: 1, lossRate: 0, networkCondition: 'perfect',
  jitter: 0, bandwidth: 'unlimited',
  selectedTopology: 'single-router',
  selectedRoute: 'primary',
  selectedSource: 'client1',
  selectedDest: 'server1',
  comparisonRunning: false,
  udpSent: 0, udpRecv: 0, udpLost: 0,
  tcpSent: 0, tcpRecv: 0, tcpLost: 0, tcpAcks: 0
};

const CONDITIONS = {
  perfect:   { loss: 0,  jitter: 0,   reorder: false },
  lossy:     { loss: 30, jitter: 20,  reorder: false },
  congested: { loss: 50, jitter: 80,  reorder: false },
  chaotic:   { loss: 70, jitter: 150, reorder: true  }
};


//  MODULE 1: TOPOLOGY & NETWORK CANVAS
// ══════════════════════════════════════════════════════
const netCanvas = $('net-canvas');
const netCtx    = netCanvas ? netCanvas.getContext('2d') : null;

function resizeNetCanvas() {
  if (!netCanvas || !netCanvas.parentElement) return;
  const p = netCanvas.parentElement;
  const w = p.clientWidth || 700;
  const h = p.clientHeight || 360;
  netCanvas.width  = Math.max(360, w > 30 ? w - 24 : 700);
  netCanvas.height = Math.max(340, h);
}

// ── Multi-Hop Waypoint Paths ──────────────────────────
function getTopologyWaypoints(topo, route, W, H) {
  const pad = 60;
  const midY = H / 2;
  const leftX = pad;
  const rightX = W - pad;

  if (topo === 'direct') {
    return [
      { x: leftX, y: midY, label: 'Host A', icon: '💻', type: 'host' },
      { x: rightX, y: midY, label: 'Server 1', icon: '🖥️', type: 'host' }
    ];
  }

  if (topo === 'single-router') {
    const rY = route === 'secondary' ? midY - 60 : (route === 'congested' ? midY + 60 : midY);
    return [
      { x: leftX, y: midY, label: 'Host A', icon: '💻', type: 'host' },
      { x: W * 0.5, y: rY, label: 'Router R1 (Edge)', icon: '🔀', type: 'router', queue: Math.floor(Math.random() * 4) },
      { x: rightX, y: midY, label: 'Server 1', icon: '🖥️', type: 'host' }
    ];
  }

  if (topo === 'dual-router') {
    const r1Y = route === 'secondary' ? midY - 50 : midY - 20;
    const r2Y = route === 'congested' ? midY + 60 : midY + 20;
    return [
      { x: leftX, y: midY, label: 'Host A', icon: '💻', type: 'host' },
      { x: W * 0.35, y: r1Y, label: 'Core R1', icon: '🔀', type: 'router', queue: 1 },
      { x: W * 0.65, y: r2Y, label: 'Agg R2', icon: '🔀', type: 'router', queue: route === 'congested' ? 12 : 2 },
      { x: rightX, y: midY, label: 'Server 1', icon: '🖥️', type: 'host' }
    ];
  }

  // multi-mesh
  const isHostB = State.selectedSource === 'client2';
  const isServer2 = State.selectedDest === 'server2';
  const srcY = isHostB ? midY + 80 : midY - 80;
  const dstY = isServer2 ? midY + 80 : midY - 80;
  const chosenRouterY = route === 'secondary' ? midY - 60 : (route === 'congested' ? midY + 60 : midY);

  return [
    { x: leftX, y: srcY, label: isHostB ? 'Host B' : 'Host A', icon: '💻', type: 'host' },
    { x: W * 0.5, y: chosenRouterY, label: 'Router R1', icon: '🔀', type: 'router', queue: 2 },
    { x: rightX, y: dstY, label: isServer2 ? 'Server 2' : 'Server 1', icon: '🖥️', type: 'host' }
  ];
}

class Packet {
  constructor(opts) {
    this.seq     = opts.seq;
    this.msg     = opts.msg || '';
    this.size    = opts.size || 64;
    this.lost    = opts.lost;
    this.reorder = opts.reorder || false;
    this.jitter  = opts.jitter || 0;
    this.yOff    = opts.yOff || 0;
    this.waypoints = opts.waypoints || [];

    this.progress = 0; // 0 to 1
    this.done     = false;
    this.exploded = false;
    this.frags    = [];
    this.t0       = performance.now();
    this.state    = 'QUEUED'; // QUEUED, IN_TRANSIT, DROPPED, DELIVERED

    if (this.waypoints.length > 0) {
      this.x = this.waypoints[0].x;
      this.y = this.waypoints[0].y;
    } else {
      this.x = 60; this.y = 100;
    }
  }

  get color() {
    if (this.lost)    return '#f85149';
    if (this.reorder) return '#58a6ff';
    return '#39d353';
  }

  update() {
    if (this.done) return;
    let speed = 0.0042 * State.animSpeed;

    if (this.jitter > 0 && this.progress > 0.3 && this.progress < 0.7) {
      speed *= Math.max(0.2, 1 - (this.jitter / 200));
    }

    this.progress = Math.min(1, this.progress + speed);
    this.state = this.progress < 0.08 ? 'QUEUED' : 'IN_TRANSIT';

    // Segmented interpolation along waypoints
    const wp = this.waypoints;
    if (wp.length >= 2) {
      const numSegments = wp.length - 1;
      const segFrac = 1 / numSegments;
      const segIndex = Math.min(numSegments - 1, Math.floor(this.progress / segFrac));
      const localT = (this.progress - segIndex * segFrac) / segFrac;

      const p0 = wp[segIndex];
      const p1 = wp[segIndex + 1];

      this.x = lerp(p0.x, p1.x, localT);
      this.y = lerp(p0.y, p1.y, localT) + Math.sin(localT * Math.PI) * (this.reorder ? 36 : 10);
    }

    // Packet drop explosion
    if (this.lost && this.progress >= 0.52 && !this.exploded) {
      this.exploded = true;
      this.done = true;
      this.state = 'DROPPED';
      for (let i = 0; i < 18; i++) {
        this.frags.push({
          x: this.x, y: this.y,
          vx: rand(-4.5, 4.5), vy: rand(-4.5, 4.5),
          life: 1, r: rand(3, 7)
        });
      }
      State.packetsLost++;
      addTimelineEntry('lost', this.seq, this.msg, this.size);
      updateReceiverLog('lost', this.seq, this.msg);
      updateStats();
    }

    // Delivery
    if (this.progress >= 1 && !this.lost) {
      this.done = true;
      this.state = 'DELIVERED';
      State.packetsReceived++;
      if (this.reorder) State.packetsOOO++;
      State.latencies.push(performance.now() - this.t0);
      addTimelineEntry(this.reorder ? 'ooo' : 'ok', this.seq, this.msg, this.size);
      updateReceiverLog(this.reorder ? 'ooo' : 'ok', this.seq, this.msg);
      updateStats();
    }
  }

  draw(ctx) {
    if (this.done && !this.exploded) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    const glow = Math.sin(performance.now() * 0.01) * 0.5 + 0.5;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8 + glow * 10;

    const w = 46, h = 26;
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    rRect(ctx, -w/2, -h/2, w, h, 6);
    ctx.shadowBlur = 0;

    // Packet sequence number text
    ctx.fillStyle = this.color;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${this.seq}`, 0, -2);

    // Mini state badge below packet
    ctx.font = '8px "Segoe UI", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(this.size + 'B', 0, 8);

    ctx.restore();

    // Fragment particle animation
    this.frags.forEach(f => {
      f.x += f.vx; f.y += f.vy; f.life -= 0.04;
      if (f.life <= 0) return;
      ctx.save();
      ctx.globalAlpha = f.life;
      ctx.fillStyle = '#f85149';
      ctx.shadowColor = '#f85149'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    this.frags = this.frags.filter(f => f.life > 0);
  }
}

let packets = [];

function drawNetBackground() {
  if (!netCtx) return;
  const W = netCanvas.width, H = netCanvas.height, ctx = netCtx;
  ctx.clearRect(0, 0, W, H);

  // Background Grid
  ctx.strokeStyle = 'rgba(48,54,61,0.4)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const waypoints = getTopologyWaypoints(State.selectedTopology, State.selectedRoute, W, H);

  // Draw Links connecting waypoints
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p0 = waypoints[i];
    const p1 = waypoints[i + 1];

    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = State.selectedRoute === 'congested' ? 'rgba(248,81,73,0.35)' : 'rgba(88,166,255,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
  }

  // Draw Nodes & Routers
  waypoints.forEach((node, idx) => {
    ctx.save();
    const isRouter = node.type === 'router';
    const isSender = idx === 0;
    const isReceiver = idx === waypoints.length - 1;
    const col = isSender ? '#58a6ff' : (isReceiver ? '#3fb950' : '#bc8cff');

    // Outer glow
    ctx.fillStyle = col + '22';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(node.x, node.y, isRouter ? 26 : 28, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // Icon
    ctx.font = isRouter ? '20px serif' : '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.icon, node.x, node.y);

    // Label with generous font size
    ctx.fillStyle = '#f0f6fc';
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(node.label, node.x, node.y + (isRouter ? 42 : 44));

    // Router Queue meter
    if (isRouter) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px monospace';
      ctx.fillText(`Queue: ${node.queue || 0}/20`, node.x, node.y + 56);
    }

    ctx.restore();
  });
}

function animLoop() {
  drawNetBackground();
  packets.forEach(p => { p.update(); p.draw(netCtx); });
  packets = packets.filter(p => !(p.done && p.frags.length === 0));

  updateAndDrawTelemetryWave();
  updateAndDrawWorldMap();

  requestAnimationFrame(animLoop);
}

// ── Send Packet ───────────────────────────────────────
function sendPacket(opts = {}) {
  const cond    = CONDITIONS[State.networkCondition];
  const loss    = Math.max(State.lossRate, cond.loss);
  const isLost  = Math.random() * 100 < loss;
  const isOOO   = !isLost && (cond.reorder || State.jitter > 50) && Math.random() < 0.35;
  const seq     = ++State.sequenceNum;
  const msg     = opts.message || $('msg-input').value || 'Hello, UDP-Scope!';
  const size    = parseInt($('packet-size').value) || 64;
  const row     = (packets.filter(p => !p.done).length % 5 - 2) * 20;

  const waypoints = getTopologyWaypoints(State.selectedTopology, State.selectedRoute, netCanvas.width, netCanvas.height);

  const pkt = new Packet({
    seq, msg, size,
    lost: isLost,
    reorder: isOOO,
    jitter: State.jitter,
    yOff: row,
    waypoints
  });

  packets.push(pkt);
  State.packetsSent++;
  State.bytesSent += (size + 28); // 20 IP + 8 UDP

  updateStats();
}

function burstSend() {
  const count = parseInt($('burst-count').value) || 5;
  const delay = parseInt($('send-delay').value)  || 200;
  let i = 0;
  const timer = setInterval(() => {
    sendPacket();
    i++;
    if (i >= count) clearInterval(timer);
  }, delay);
}

function resetSandbox() {
  packets = [];
  State.packetsSent = 0; State.packetsReceived = 0; State.packetsLost = 0;
  State.packetsOOO  = 0; State.bytesSent = 0; State.latencies = [];
  $('timeline').innerHTML = '';
  $('recv-log').innerHTML = '<div class="log-placeholder">Waiting for incoming UDP datagrams…</div>';
  updateStats();
}

function updateStats() {
  $('stat-sent').textContent       = State.packetsSent;
  $('stat-bytes-sent').textContent = formatBytes(State.bytesSent);
  $('stat-recv').textContent       = State.packetsReceived;
  $('stat-lost').textContent       = State.packetsLost;
  $('stat-ooo').textContent        = State.packetsOOO;

  const total = State.packetsSent;
  const lossPct = total > 0 ? ((State.packetsLost / total) * 100).toFixed(1) : 0;
  $('stat-loss-pct').textContent = `${lossPct}%`;

  const avgLat = State.latencies.length > 0
    ? (State.latencies.reduce((a,b)=>a+b,0) / State.latencies.length).toFixed(1)
    : 0;
  $('stat-latency').textContent = `${avgLat} ms`;

  // Throughput calculation
  const throughput = total > 0 ? (State.bytesSent / Math.max(1, (performance.now() / 1000))).toFixed(0) : 0;
  $('stat-throughput').textContent = `${throughput} B/s`;

  // Update Top Bar & NOC KPI indicators
  if ($('top-kpi-avail'))  $('top-kpi-avail').textContent = total > 0 ? `${(100 - parseFloat(lossPct)).toFixed(2)}%` : '99.98%';
  if ($('top-kpi-ping'))   $('top-kpi-ping').textContent = `${avgLat || 8} ms`;
  if ($('top-kpi-jitter')) $('top-kpi-jitter').textContent = `${State.jitter || 2} ms`;
  if ($('top-kpi-loss'))   $('top-kpi-loss').textContent = `${lossPct}%`;
  if ($('stat-jitter-dyn')) $('stat-jitter-dyn').textContent = `${State.jitter || 2} ms`;

  // Update KPI cards in performance tab
  const kpiPdr = $('kpi-pdr');
  if (kpiPdr) {
    const pdr = total > 0 ? ((State.packetsReceived / total) * 100).toFixed(1) : '100.0';
    kpiPdr.textContent = `${pdr}%`;
    $('kpi-latency').textContent = `${avgLat} ms`;
    $('kpi-jitter').textContent = `${(State.jitter * 0.4).toFixed(1)} ms`;
    $('kpi-throughput').textContent = `${(throughput / 1024).toFixed(1)} KB/s`;
    $('kpi-ooo').textContent = `${State.packetsOOO} pkts`;
  }
}

function updateReceiverLog(status, seq, msg) {
  const log = $('recv-log');
  if (!log) return;
  const placeholder = log.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();

  const item = document.createElement('div');
  item.className = `recv-pkt-item ${status}`;
  const now = new Date().toLocaleTimeString('en', { hour12: false });
  if (status === 'ok')  item.textContent = `[${now}] PKT #${seq} Received: "${msg.slice(0,25)}"`;
  if (status === 'lost')item.textContent = `[${now}] PKT #${seq} DROPPED (Checksum/Loss)`;
  if (status === 'ooo') item.textContent = `[${now}] PKT #${seq} OUT-OF-ORDER Arrival!`;

  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
}

function addTimelineEntry(status, seq, msg, size) {
  const tl = $('timeline');
  if (!tl) return;
  const el = document.createElement('div');
  el.className = `tl-item ${status}`;
  const icon = status === 'ok' ? '✓' : (status === 'lost' ? '✗' : '🔀');
  el.innerHTML = `<span>${icon} #${seq}</span> <span>${size}B</span>`;
  tl.appendChild(el);
  tl.scrollLeft = tl.scrollWidth;
}

// ══════════════════════════════════════════════════════


// ── NOC Telemetry Wave Animation (Real-Time Telemetry) ────
const teleWaveCanvas = $('telemetry-wave-canvas');
const teleWaveCtx = teleWaveCanvas ? teleWaveCanvas.getContext('2d') : null;
let teleWaveData = Array(45).fill(25);
let teleWavePhase = 0;

function resizeTelemetryWave() {
  if (!teleWaveCanvas || !teleWaveCanvas.parentElement) return;
  teleWaveCanvas.width = teleWaveCanvas.parentElement.clientWidth || 360;
  teleWaveCanvas.height = 135;
}

function updateAndDrawTelemetryWave() {
  if (!teleWaveCtx || !teleWaveCanvas) return;
  const W = teleWaveCanvas.width;
  const H = teleWaveCanvas.height;
  teleWaveCtx.clearRect(0, 0, W, H);

  // Background grid
  teleWaveCtx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  teleWaveCtx.lineWidth = 1;
  for (let y = 20; y < H; y += 25) {
    teleWaveCtx.beginPath();
    teleWaveCtx.moveTo(0, y);
    teleWaveCtx.lineTo(W, y);
    teleWaveCtx.stroke();
  }

  teleWavePhase += 0.06;
  const activityBoost = State.packetsSent > 0 ? Math.min(30, (State.bytesSent % 100)) : 0;
  const nextVal = 38 + Math.sin(teleWavePhase) * 16 + Math.cos(teleWavePhase * 0.4) * 12 + activityBoost + rand(-3, 3);
  teleWaveData.push(clamp(nextVal, 8, H - 12));
  if (teleWaveData.length > 50) teleWaveData.shift();

  // Glowing area fill
  const grad = teleWaveCtx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
  grad.addColorStop(0.6, 'rgba(56, 189, 248, 0.1)');
  grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

  const stepX = W / (teleWaveData.length - 1);
  teleWaveCtx.beginPath();
  teleWaveCtx.moveTo(0, H);
  for (let i = 0; i < teleWaveData.length; i++) {
    const x = i * stepX;
    const y = H - teleWaveData[i];
    if (i === 0) teleWaveCtx.lineTo(x, y);
    else {
      const prevX = (i - 1) * stepX;
      const prevY = H - teleWaveData[i - 1];
      const cx = (prevX + x) / 2;
      teleWaveCtx.bezierCurveTo(cx, prevY, cx, y, x, y);
    }
  }
  teleWaveCtx.lineTo(W, H);
  teleWaveCtx.closePath();
  teleWaveCtx.fillStyle = grad;
  teleWaveCtx.fill();

  // Main cyan stroke
  teleWaveCtx.save();
  teleWaveCtx.strokeStyle = '#38bdf8';
  teleWaveCtx.lineWidth = 2.2;
  teleWaveCtx.shadowColor = '#38bdf8';
  teleWaveCtx.shadowBlur = 8;
  teleWaveCtx.beginPath();
  for (let i = 0; i < teleWaveData.length; i++) {
    const x = i * stepX;
    const y = H - teleWaveData[i];
    if (i === 0) teleWaveCtx.moveTo(x, y);
    else {
      const prevX = (i - 1) * stepX;
      const prevY = H - teleWaveData[i - 1];
      const cx = (prevX + x) / 2;
      teleWaveCtx.bezierCurveTo(cx, prevY, cx, y, x, y);
    }
  }
  teleWaveCtx.stroke();
  teleWaveCtx.restore();

  // Secondary green stream
  teleWaveCtx.save();
  teleWaveCtx.strokeStyle = 'rgba(34, 197, 94, 0.7)';
  teleWaveCtx.lineWidth = 1.4;
  teleWaveCtx.setLineDash([4, 4]);
  teleWaveCtx.beginPath();
  for (let i = 0; i < teleWaveData.length; i++) {
    const x = i * stepX;
    const y = H - (teleWaveData[i] * 0.7 + 10);
    if (i === 0) teleWaveCtx.moveTo(x, y);
    else teleWaveCtx.lineTo(x, y);
  }
  teleWaveCtx.stroke();
  teleWaveCtx.restore();

  // Leading edge beacon
  const lastX = (teleWaveData.length - 1) * stepX;
  const lastY = H - teleWaveData[teleWaveData.length - 1];
  teleWaveCtx.save();
  teleWaveCtx.fillStyle = '#38bdf8';
  teleWaveCtx.shadowColor = '#38bdf8';
  teleWaveCtx.shadowBlur = 10;
  teleWaveCtx.beginPath();
  teleWaveCtx.arc(lastX - 2, lastY, 4, 0, Math.PI * 2);
  teleWaveCtx.fill();
  teleWaveCtx.restore();
}

// ── NOC Global Transit Routing World Map Animation ─────────────
const worldMapCanvas = $('world-map-canvas');
const worldMapCtx = worldMapCanvas ? worldMapCanvas.getContext('2d') : null;
let worldMapTime = 0;

const WORLD_HUBS = [
  { name: 'Sao Paulo', code: 'GRU', xPct: 0.32, yPct: 0.75, col: '#38bdf8' },
  { name: 'New York',  code: 'JFK', xPct: 0.28, yPct: 0.36, col: '#22c55e' },
  { name: 'London',    code: 'LHR', xPct: 0.49, yPct: 0.30, col: '#a855f7' },
  { name: 'Frankfurt', code: 'FRA', xPct: 0.54, yPct: 0.33, col: '#38bdf8' },
  { name: 'Tokyo',     code: 'NRT', xPct: 0.82, yPct: 0.40, col: '#f59e0b' },
  { name: 'Singapore', code: 'SIN', xPct: 0.76, yPct: 0.65, col: '#22c55e' }
];

const WORLD_ROUTES = [
  { from: 0, to: 1 },
  { from: 1, to: 2 },
  { from: 2, to: 3 },
  { from: 3, to: 4 },
  { from: 4, to: 5 },
  { from: 0, to: 2 }
];

function resizeWorldMap() {
  if (!worldMapCanvas || !worldMapCanvas.parentElement) return;
  worldMapCanvas.width = worldMapCanvas.parentElement.clientWidth || 400;
  worldMapCanvas.height = 150;
}

function updateAndDrawWorldMap() {
  if (!worldMapCtx || !worldMapCanvas) return;
  const W = worldMapCanvas.width;
  const H = worldMapCanvas.height;
  worldMapCtx.clearRect(0, 0, W, H);

  worldMapTime += 0.02;

  // Dot matrix background
  worldMapCtx.fillStyle = 'rgba(56, 189, 248, 0.07)';
  for (let gx = 15; gx < W; gx += 22) {
    for (let gy = 15; gy < H; gy += 20) {
      worldMapCtx.beginPath();
      worldMapCtx.arc(gx, gy, 1, 0, Math.PI * 2);
      worldMapCtx.fill();
    }
  }

  // Laser Arcs
  WORLD_ROUTES.forEach((r, idx) => {
    const h1 = WORLD_HUBS[r.from];
    const h2 = WORLD_HUBS[r.to];
    const x1 = h1.xPct * W, y1 = h1.yPct * H;
    const x2 = h2.xPct * W, y2 = h2.yPct * H;
    const cx = (x1 + x2) / 2;
    const cy = Math.min(y1, y2) - 24;

    worldMapCtx.save();
    worldMapCtx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    worldMapCtx.lineWidth = 1.2;
    worldMapCtx.setLineDash([4, 4]);
    worldMapCtx.beginPath();
    worldMapCtx.moveTo(x1, y1);
    worldMapCtx.quadraticCurveTo(cx, cy, x2, y2);
    worldMapCtx.stroke();
    worldMapCtx.restore();

    // Pulse
    const t = (worldMapTime * 0.8 + idx * 0.3) % 1;
    const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
    const py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;

    worldMapCtx.save();
    worldMapCtx.fillStyle = '#38bdf8';
    worldMapCtx.shadowColor = '#38bdf8';
    worldMapCtx.shadowBlur = 8;
    worldMapCtx.beginPath();
    worldMapCtx.arc(px, py, 2.5, 0, Math.PI * 2);
    worldMapCtx.fill();
    worldMapCtx.restore();
  });

  // Hubs
  WORLD_HUBS.forEach((hub, idx) => {
    const hx = hub.xPct * W;
    const hy = hub.yPct * H;

    const pulse = (Math.sin(worldMapTime * 3 + idx) + 1) / 2;
    worldMapCtx.save();
    worldMapCtx.strokeStyle = hub.col;
    worldMapCtx.globalAlpha = 0.5 - pulse * 0.4;
    worldMapCtx.lineWidth = 1;
    worldMapCtx.beginPath();
    worldMapCtx.arc(hx, hy, 4 + pulse * 9, 0, Math.PI * 2);
    worldMapCtx.stroke();

    worldMapCtx.globalAlpha = 1;
    worldMapCtx.fillStyle = hub.col;
    worldMapCtx.shadowColor = hub.col;
    worldMapCtx.shadowBlur = 6;
    worldMapCtx.beginPath();
    worldMapCtx.arc(hx, hy, 3.5, 0, Math.PI * 2);
    worldMapCtx.fill();

    worldMapCtx.shadowBlur = 0;
    worldMapCtx.font = 'bold 8px monospace';
    worldMapCtx.fillStyle = '#94a3b8';
    worldMapCtx.textAlign = 'center';
    worldMapCtx.fillText(hub.code, hx, hy - 7);
    worldMapCtx.restore();
  });
}



// ══════════════════════════════════════════════════════
//  MODULE 3: UDP VS TCP COMPARISON LANES (FIXED & ANIMATED)
// ══════════════════════════════════════════════════════
const udpLC   = $('udp-lane-canvas');
const tcpLC   = $('tcp-lane-canvas');
const udpLCtx = udpLC ? udpLC.getContext('2d') : null;
const tcpLCtx = tcpLC ? tcpLC.getContext('2d') : null;
let udpLanePackets = [];
let tcpLanePackets = [];
let compSendTimer  = null;
let compAnimId     = null;
let cmpAnimSpeed   = 1;

function resizeLaneCanvas(canvas) {
  if (!canvas) return;
  const parent = canvas.parentElement;
  const parentW = parent ? parent.clientWidth : 0;
  canvas.width  = Math.max(360, (parentW > 40 ? parentW - 24 : 760));
  canvas.height = 150;
}

class LanePkt {
  constructor(canvas, ctx, opts) {
    this.canvas   = canvas;
    this.ctx      = ctx;
    this.W        = canvas.width;
    this.H        = canvas.height;
    this.lost     = opts.lost || false;
    this.ack      = opts.ack || false;
    this.color    = opts.color || '#3b82f6';
    this.speed    = opts.speed || 2.5;
    this.dir      = opts.dir || 1; // 1: Left -> Right, -1: Right -> Left
    this.label    = opts.label || '';
    this.row      = opts.row || 0;
    this.progress = this.dir === 1 ? 0 : 1;
    this.done     = false;
    this.exploded = false;
    this.frags    = [];
    this.dropTextTimer = 0;
  }

  update() {
    if (this.done) return;
    const step = (this.speed * 0.0035 * cmpAnimSpeed) * this.dir;
    this.progress += step;

    // Drop trigger at 50% distance
    if (this.dir === 1 && this.lost && this.progress >= 0.48 && !this.exploded) {
      this.exploded = true;
      this.done = true;
      this.dropTextTimer = 35;
      for (let i = 0; i < 14; i++) {
        this.frags.push({
          x: lerp(40, this.W - 40, this.progress),
          y: this.H / 2 + this.row,
          vx: rand(-3.5, 3.5),
          vy: rand(-3.5, 3.5),
          life: 1,
          r: rand(2.5, 5),
          col: this.color === '#22c55e' ? '#f59e0b' : '#ef4444'
        });
      }
    }

    if ((this.dir === 1 && this.progress >= 1) || (this.dir === -1 && this.progress <= 0)) {
      this.done = true;
    }
  }

  draw() {
    if (this.done && !this.exploded && this.dropTextTimer <= 0) return;
    const ctx = this.ctx;
    const x = lerp(40, this.W - 40, clamp(this.progress, 0, 1));
    const y = this.H / 2 + this.row;

    if (!this.exploded) {
      ctx.save();
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 10;
      rRect(ctx, x - 22, y - 12, 44, 24, 6);
      ctx.shadowBlur = 0;

      // Subtle border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.label, x, y + 1);
      ctx.restore();
    }

    // Dropped label flash
    if (this.dropTextTimer > 0) {
      this.dropTextTimer--;
      ctx.save();
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 8;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('✖ DROPPED', x, y - 16);
      ctx.restore();
    }

    // Explosion debris
    this.frags.forEach(f => {
      f.x += f.vx;
      f.y += f.vy;
      f.life -= 0.04;
      if (f.life <= 0) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.col || '#ef4444';
      ctx.shadowColor = f.col || '#ef4444';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    this.frags = this.frags.filter(f => f.life > 0);
  }
}

function drawLaneBG(ctx, canvas, col, name) {
  if (!ctx || !canvas) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Digital grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  // Carrier track
  ctx.strokeStyle = col + '33';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(40, H / 2);
  ctx.lineTo(W - 40, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Watermark text
  ctx.save();
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = col + '12';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name + ' TRANSMISSION PIPELINE', W / 2, H / 2);
  ctx.restore();

  // Nodes using drawNetNode
  drawNetNode(ctx, 40, H / 2, '💻', col, 'SENDER', 'Port 5000');
  drawNetNode(ctx, W - 40, H / 2, '🖥️', col, 'RECEIVER', 'Port 8080');
}

function startComparison() {
  if (State.comparisonRunning) return;
  State.comparisonRunning = true;
  udpLanePackets = [];
  tcpLanePackets = [];
  State.udpSent = State.tcpSent = State.udpRecv = State.tcpRecv = State.udpLost = State.tcpLost = State.tcpAcks = 0;

  resizeLaneCanvas(udpLC);
  resizeLaneCanvas(tcpLC);
  const lossRate = parseInt($('cmp-loss').value) || 30;

  let row = 0;
  compSendTimer = setInterval(() => {
    if (!State.comparisonRunning) return;
    const uLost = Math.random() * 100 < lossRate;
    const tLost = Math.random() * 100 < lossRate;

    // UDP Packet (Fire-and-forget)
    State.udpSent++;
    udpLanePackets.push(new LanePkt(udpLC, udpLCtx, {
      lost: uLost,
      color: '#3b82f6',
      speed: 3.2,
      label: 'UDP #' + State.udpSent,
      row: (row % 3 - 1) * 16
    }));
    if (uLost) State.udpLost++;
    else State.udpRecv++;

    // TCP Packet (ARQ with ACK feedback)
    State.tcpSent++;
    const tcpSeq = State.tcpSent;
    tcpLanePackets.push(new LanePkt(tcpLC, tcpLCtx, {
      lost: tLost,
      color: '#22c55e',
      speed: 2.2,
      label: 'TCP #' + tcpSeq,
      row: (row % 3 - 1) * 16
    }));

    if (tLost) {
      State.tcpLost++;
      // Retransmission after timeout
      setTimeout(() => {
        if (!State.comparisonRunning) return;
        tcpLanePackets.push(new LanePkt(tcpLC, tcpLCtx, {
          lost: false,
          color: '#f59e0b',
          speed: 2.2,
          label: 'RETX #' + tcpSeq,
          row: (row % 3 - 1) * 16
        }));
        State.tcpRecv++;
        updateCmpStats();

        // ACK returned for retransmission
        setTimeout(() => {
          if (!State.comparisonRunning) return;
          tcpLanePackets.push(new LanePkt(tcpLC, tcpLCtx, {
            ack: true,
            lost: false,
            speed: 2.4,
            dir: -1,
            color: '#06b6d4',
            label: 'ACK #' + tcpSeq
          }));
          State.tcpAcks++;
          updateCmpStats();
        }, 550);
      }, 700);
    } else {
      State.tcpRecv++;
      setTimeout(() => {
        if (!State.comparisonRunning) return;
        tcpLanePackets.push(new LanePkt(tcpLC, tcpLCtx, {
          ack: true,
          lost: false,
          speed: 2.4,
          dir: -1,
          color: '#06b6d4',
          label: 'ACK #' + tcpSeq
        }));
        State.tcpAcks++;
        updateCmpStats();
      }, 550);
    }

    row++;
    updateCmpStats();
  }, 750);

  function loop() {
    if (!State.comparisonRunning) return;
    drawLaneBG(udpLCtx, udpLC, '#3b82f6', 'UDP');
    udpLanePackets.forEach(p => { p.update(); p.draw(); });
    udpLanePackets = udpLanePackets.filter(p => !(p.done && p.frags.length === 0 && p.dropTextTimer <= 0));

    drawLaneBG(tcpLCtx, tcpLC, '#22c55e', 'TCP');
    tcpLanePackets.forEach(p => { p.update(); p.draw(); });
    tcpLanePackets = tcpLanePackets.filter(p => !(p.done && p.frags.length === 0 && p.dropTextTimer <= 0));

    if ($('udp-pkt-count')) $('udp-pkt-count').textContent = `${State.udpSent} sent`;
    if ($('tcp-pkt-count')) $('tcp-pkt-count').textContent = `${State.tcpSent} sent`;

    compAnimId = requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function stopComparison() {
  State.comparisonRunning = false;
  if (compSendTimer) clearInterval(compSendTimer);
  if (compAnimId) cancelAnimationFrame(compAnimId);
}

function updateCmpStats() {
  if ($('cmp-udp-sent')) $('cmp-udp-sent').textContent = State.udpSent;
  if ($('cmp-udp-recv')) $('cmp-udp-recv').textContent = State.udpRecv;
  if ($('cmp-udp-lost')) $('cmp-udp-lost').textContent = State.udpLost;
  if ($('cmp-tcp-sent')) $('cmp-tcp-sent').textContent = State.tcpSent;
  if ($('cmp-tcp-recv')) $('cmp-tcp-recv').textContent = State.tcpRecv;
  if ($('cmp-tcp-lost')) $('cmp-tcp-lost').textContent = State.tcpLost;
  if ($('cmp-tcp-acks')) $('cmp-tcp-acks').textContent = State.tcpAcks;
}

function initComparisonCanvases() {
  resizeLaneCanvas(udpLC);
  resizeLaneCanvas(tcpLC);
  drawLaneBG(udpLCtx, udpLC, '#3b82f6', 'UDP');
  drawLaneBG(tcpLCtx, tcpLC, '#22c55e', 'TCP');
}


// ══════════════════════════════════════════════════════
//  MODULE 4: REDESIGNED PACKET ASSEMBLY WORKSPACE
// ══════════════════════════════════════════════════════
const pktCanvas = $('packet-canvas');
const pktCtx    = pktCanvas ? pktCanvas.getContext('2d') : null;
let pktAnimId   = null;
let builtPacket = null;
let bitErrorIdx = -1;
let selectedFieldKey = 'udp_dst_port';
let pbLogFilter = 'all';
const pbLogData = [];

// Network Topology Canvas & Simulation State
const paNetCanvas = $('pa-net-canvas');
const paNetCtx    = paNetCanvas ? paNetCanvas.getContext('2d') : null;
let paNetAnimId   = null;
let paTransitState = {
  active: false,
  progress: 0,
  isError: false,
  speed: 0.012,
  hudText: 'Idle (Ready)'
};
const paCarrierParticles = [];
const paDeliveryRipples   = [];

// 5-Stage Datagram Assembly Progress State
let paStage = 5;
let paStagePlaying = false;
let paStageTimer = null;
const PA_STAGE_INFO = {
  1: {
    badge: 'Stage 1: Application Data Buffer',
    desc: 'Application process creates raw payload in memory (ASCII text or binary payload). This data will be passed into the network stack via sendto() without transport or network headers.'
  },
  2: {
    badge: 'Stage 2: UDP Header Attachment (Layer 4)',
    desc: 'Transport layer attaches an 8-byte UDP header containing 16-bit Source Port, Destination Port, Length, and 1\'s-complement Checksum calculated across pseudo-header, header, and data.'
  },
  3: {
    badge: 'Stage 3: IPv4 Header Attachment (Layer 3)',
    desc: 'Network layer wraps the UDP datagram with a 20-byte IPv4 header containing Version 4, IHL 5, Total Length, TTL, Protocol 17, and 32-bit Source/Destination IP addresses.'
  },
  4: {
    badge: 'Stage 4: Complete Datagram Encapsulation',
    desc: 'Hierarchical encapsulation is finalized: [IPv4 Header: 20B] + [UDP Header: 8B] + [Application Payload: N Bytes]. Memory offsets and layer boundaries are established.'
  },
  5: {
    badge: 'Stage 5: Ready for Wire Transmission',
    desc: 'The datagram is serialized into frame memory, passed down to the data-link layer (Ethernet II), and queued at the network interface card (NIC) for physical transmission.'
  }
};

// Complete Field Metadata Dictionary (11 IPv4, 4 UDP, 1 Payload)
const FIELD_DEFS = {
  ver: {
    name: 'Version',
    layer: 'IPv4',
    bits: '4 bits',
    byteStart: 0,
    byteEnd: 0,
    getValue: p => '4 (0100 binary / IPv4)',
    desc: 'Specifies the IP protocol version. Standard IPv4 datagrams use value 4. Receiving routers and hosts discard datagrams with unrecognized version numbers.',
    example: 'RFC 791 Section 3.1. Constant: 4'
  },
  ihl: {
    name: 'Internet Header Length (IHL)',
    layer: 'IPv4',
    bits: '4 bits',
    byteStart: 0,
    byteEnd: 0,
    getValue: p => '5 (20 bytes / 5 × 32-bit words)',
    desc: 'Specifies the length of the IPv4 header measured in 32-bit (4-byte) dwords. The minimum valid header length is 5 (5 × 4 = 20 bytes when no options are appended).',
    example: 'RFC 791. Standard baseline: 5 (20 bytes)'
  },
  dscp_ecn: {
    name: 'DSCP & ECN (Type of Service)',
    layer: 'IPv4',
    bits: '8 bits (6b DSCP + 2b ECN)',
    byteStart: 1,
    byteEnd: 1,
    getValue: p => '0x00 (Best Effort, Non-ECT)',
    desc: 'Differentiated Services Code Point (DSCP, 6 bits) for Quality of Service traffic classification and Explicit Congestion Notification (ECN, 2 bits) for network congestion signaling without packet loss.',
    example: 'RFC 2474 / RFC 3168. 0x00 = Default Best Effort'
  },
  total_len: {
    name: 'Total Length',
    layer: 'IPv4',
    bits: '16 bits',
    byteStart: 2,
    byteEnd: 3,
    getValue: p => `${p.length + 20} bytes (0x${(p.length + 20).toString(16).padStart(4, '0').toUpperCase()})`,
    desc: 'Specifies the entire size of the IP datagram in bytes, including the 20-byte IPv4 header, 8-byte UDP header, and application payload. Maximum theoretic size is 65,535 bytes.',
    example: 'IPv4 Hdr (20B) + UDP Hdr (8B) + Payload (N Bytes)'
  },
  ident: {
    name: 'Identification',
    layer: 'IPv4',
    bits: '16 bits',
    byteStart: 4,
    byteEnd: 5,
    getValue: p => '0x0001 (1)',
    desc: 'A unique 16-bit number assigned by the sender host to identify all fragments belonging to a particular IP datagram during IP fragmentation and destination reassembly.',
    example: 'RFC 791. Sequential packet counter: 0x0001'
  },
  flags_frag: {
    name: 'Flags & Fragment Offset',
    layer: 'IPv4',
    bits: '16 bits (3b Flags + 13b Offset)',
    byteStart: 6,
    byteEnd: 7,
    getValue: p => 'DF=1, MF=0, Offset=0 (0x4000)',
    desc: '3 bits of control flags: Bit 0 (Reserved=0), Bit 1 (DF: Don\'t Fragment=1), Bit 2 (MF: More Fragments=0), followed by 13 bits of Fragment Offset in 8-byte units.',
    example: '0x4000 (Don\'t Fragment bit enabled)'
  },
  ttl: {
    name: 'Time to Live (TTL)',
    layer: 'IPv4',
    bits: '8 bits',
    byteStart: 8,
    byteEnd: 8,
    getValue: p => `${p.ttl} hops remaining`,
    desc: 'Hop limit counter decremented by 1 at every forwarding router. Prevents datagrams from looping indefinitely in case of routing loops. When TTL hits 0, router drops packet and sends ICMP Time Exceeded (Type 11).',
    example: 'RFC 791. Typical defaults: 64 (Linux), 128 (Windows)'
  },
  proto: {
    name: 'Protocol',
    layer: 'IPv4',
    bits: '8 bits',
    byteStart: 9,
    byteEnd: 9,
    getValue: p => '17 (0x11 UDP)',
    desc: 'Specifies the encapsulated Layer 4 transport protocol carried inside the IP payload. Number 17 indicates User Datagram Protocol (UDP). TCP is 6, ICMP is 1.',
    example: 'IANA Protocol Numbers: 17 = UDP'
  },
  ip_csum: {
    name: 'Header Checksum',
    layer: 'IPv4',
    bits: '16 bits',
    byteStart: 10,
    byteEnd: 11,
    getValue: p => '0x0000 [Validation Offloaded]',
    desc: '16-bit 1\'s complement checksum calculated strictly over the IPv4 header fields. Recalculated at each router as TTL decrements. In hardware offloaded NICs, software calculates 0x0000.',
    example: 'RFC 791 Section 3.1.'
  },
  src_ip: {
    name: 'Source IP Address',
    layer: 'IPv4',
    bits: '32 bits (4 bytes)',
    byteStart: 12,
    byteEnd: 15,
    getValue: p => `${p.srcIP}`,
    desc: '32-bit IPv4 address of the transmitting sender node.',
    example: '192.168.1.10 (RFC 1918 Private Address)'
  },
  dst_ip: {
    name: 'Destination IP Address',
    layer: 'IPv4',
    bits: '32 bits (4 bytes)',
    byteStart: 16,
    byteEnd: 19,
    getValue: p => `${p.dstIP}`,
    desc: '32-bit IPv4 address of the target receiver host, subnet broadcast address, or multicast group.',
    example: '192.168.1.20 (Target Host IP)'
  },
  udp_src_port: {
    name: 'Source Port',
    layer: 'UDP',
    bits: '16 bits',
    byteStart: 20,
    byteEnd: 21,
    getValue: p => `${p.srcPort} (0x${p.srcPort.toString(16).toUpperCase()})`,
    desc: '16-bit port number identifying the sending application socket process. When replies are sent back, this port becomes the destination port.',
    example: 'RFC 768. Ephemeral dynamic range: 49152-65535 or custom app port'
  },
  udp_dst_port: {
    name: 'Destination Port',
    layer: 'UDP',
    bits: '16 bits',
    byteStart: 22,
    byteEnd: 23,
    getValue: p => `${p.dstPort} (0x${p.dstPort.toString(16).toUpperCase()})`,
    desc: '16-bit port number identifying the target application or listening daemon socket on the receiving host (e.g., DNS port 53, NTP port 123, TFTP port 69).',
    example: 'RFC 768 / RFC 1700. Well-known: 53 (DNS), 67 (DHCP), 123 (NTP)'
  },
  udp_len: {
    name: 'UDP Length',
    layer: 'UDP',
    bits: '16 bits',
    byteStart: 24,
    byteEnd: 25,
    getValue: p => `${p.length} bytes (0x${p.length.toString(16).padStart(4, '0').toUpperCase()})`,
    desc: 'Total length in bytes of the UDP datagram, including both the 8-byte UDP header and the payload. The minimum theoretical value is 8 bytes (empty payload).',
    example: '8 (UDP Header) + Payload Bytes'
  },
  udp_csum: {
    name: 'UDP Checksum',
    layer: 'UDP',
    bits: '16 bits',
    byteStart: 26,
    byteEnd: 27,
    getValue: p => `${p.checksum} ${bitErrorIdx >= 0 ? '❌ [CRC MISMATCH / CORRUPTED]' : '✅ [CORRECT / VALID]'}`,
    desc: '16-bit 1\'s complement checksum calculated across an IPv4 pseudo-header, the UDP header, and the payload. Detects data corruption in transit. If corrupt, receiving stack discards datagram silently.',
    example: 'RFC 768 / RFC 1071 internet checksum algorithm'
  },
  payload: {
    name: 'Application Payload Data',
    layer: 'Payload',
    bits: 'Variable length',
    byteStart: 28,
    byteEnd: -1,
    getValue: p => `"${p.payload}" (${p.payload.length} bytes)`,
    desc: 'Raw application data bytes transmitted over the UDP socket without segmentation or flow control (e.g. DNS query name, VoIP RTP audio frames, game client position vectors).',
    example: 'ASCII string, DNS wire message, or binary telemetry struct'
  }
};

function resizePktCanvas() {
  if (!pktCanvas) return;
  const p = pktCanvas.parentElement;
  if (!p) return;
  pktCanvas.width  = p.clientWidth || 600;
  pktCanvas.height = Math.max(380, (p.clientHeight || 400) - 40);
}

function resizePaNetCanvas() {
  if (!paNetCanvas) return;
  const p = paNetCanvas.parentElement;
  if (!p) return;
  const rect = p.getBoundingClientRect();
  const dpr  = window.devicePixelRatio || 1;
  const w    = rect.width || p.clientWidth || 800;
  const h    = Math.max(190, p.clientHeight || 190);
  paNetCanvas.width  = w * dpr;
  paNetCanvas.height = h * dpr;
  if (paNetCtx) {
    if (paNetCtx.resetTransform) paNetCtx.resetTransform();
    else paNetCtx.setTransform(1, 0, 0, 1, 0, 0);
    paNetCtx.scale(dpr, dpr);
  }
}

// ── Raw Packet Byte Generator ────────────────────────
function getRawPacketBytes(p) {
  const payloadStr = p ? p.payload : 'Hello, UDP-Scope!';
  const pb = [...payloadStr].map((c, i) =>
    (bitErrorIdx >= 0 && i === bitErrorIdx) ? (c.charCodeAt(0) ^ 0xFF) : c.charCodeAt(0)
  );
  const len = 8 + pb.length;
  const srcIP = (p && p.srcIP) || '192.168.1.10';
  const dstIP = (p && p.dstIP) || '192.168.1.20';
  const srcPort = (p && p.srcPort) || 5000;
  const dstPort = (p && p.dstPort) || 8080;
  const ttl = (p && p.ttl) || 64;

  return [
    0x45, 0x00, 0x00, (len + 20) & 0xFFFF,
    0x00, 0x01, 0x40, 0x00, ttl & 0xFF, 0x11, 0x00, 0x00,
    ...srcIP.split('.').map(Number),
    ...dstIP.split('.').map(Number),
    (srcPort >> 8) & 0xFF, srcPort & 0xFF,
    (dstPort >> 8) & 0xFF, dstPort & 0xFF,
    (len >> 8) & 0xFF, len & 0xFF,
    0x00, 0x00,
    ...pb
  ];
}

function buildHexDump(srcIP, dstIP, srcPort, dstPort, ttl, payload) {
  const pb  = [...payload].map(c => c.charCodeAt(0));
  const len = 8 + pb.length;
  const all = [
    0x45, 0x00, 0x00, len + 20,
    0x00, 0x01, 0x40, 0x00, ttl, 0x11, 0x00, 0x00,
    ...srcIP.split('.').map(Number),
    ...dstIP.split('.').map(Number),
    (srcPort >> 8) & 0xFF, srcPort & 0xFF,
    (dstPort >> 8) & 0xFF, dstPort & 0xFF,
    (len >> 8) & 0xFF, len & 0xFF, 0x00, 0x00,
    ...pb
  ];
  const lines = [];
  for (let i = 0; i < all.length; i += 16) {
    const chunk = all.slice(i, i + 16);
    const addr  = i.toString(16).padStart(4, '0').toUpperCase();
    const hex   = chunk.map(hexByte).join(' ');
    const ascii = chunk.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    lines.push(`${addr}  ${hex.padEnd(48)}  |${ascii}|`);
  }
  return lines.join('\n');
}

// ── Status Pill & Message Helpers ─────────────────────
function updateStatusPill(state, text) {
  const pill = $('pa-status-pill');
  const label = $('pa-status-text');
  if (!pill) return;
  pill.className = `pa-status-pill ${state}`;
  if (label) label.textContent = text;
}

function setStatusMessage(msg) {
  const el = $('pa-status-message');
  if (el) el.innerHTML = msg;
}

// ── Primary Build & Dissect Routine ──────────────────
async function buildAndVisualizePacket() {
  const srcIP   = $('src-ip') ? ($('src-ip').value || '192.168.1.10') : '192.168.1.10';
  const dstIP   = $('dst-ip') ? ($('dst-ip').value || '192.168.1.20') : '192.168.1.20';
  const srcPort = $('src-port') ? (parseInt($('src-port').value) || 5000) : 5000;
  const dstPort = $('dst-port') ? (parseInt($('dst-port').value) || 8080) : 8080;
  const ttl     = $('ttl') ? (parseInt($('ttl').value) || 64) : 64;
  const payload = $('payload-data') ? ($('payload-data').value || 'Hello, UDP-Scope!') : 'Hello, UDP-Scope!';
  const length  = 8 + payload.length;

  const cs = calcChecksum(srcIP + dstIP + srcPort + dstPort + payload);
  if ($('checksum-val')) $('checksum-val').value = cs;
  if ($('total-length')) $('total-length').value = `${length + 20} bytes`;

  builtPacket = { srcIP, dstIP, srcPort, dstPort, ttl, payload, length, checksum: cs };
  bitErrorIdx = -1;

  // Sync legacy dump & decoded fields
  if ($('hex-dump')) $('hex-dump').textContent = buildHexDump(srcIP, dstIP, srcPort, dstPort, ttl, payload);
  updateDecodedFields(false);
  renderDatagramDiagram(false);
  renderWiresharkTree(builtPacket, false);

  // Modern Workstation Components
  updatePacketTelemetry();
  renderInteractiveDiagram();
  renderInteractiveHex();
  renderInteractiveBinary();
  selectPacketField(selectedFieldKey || 'udp_dst_port');

  updateStatusPill('ready', 'Packet Ready');
  setStatusMessage(`✓ Datagram assembled: <b>${length + 20} bytes</b> [IPv4: 20B + UDP: 8B + Data: ${payload.length}B]. Ready for network transmission.`);

  pbLogEvent('build', `Datagram constructed: ${srcIP}:${srcPort} ➔ ${dstIP}:${dstPort}`,
    `Payload: "${payload.slice(0, 35)}" | Total Size: ${length + 20}B | Checksum: ${cs}`);

  // Auto-run stage assembly walkthrough to 5
  setPaStage(5);
}

// ── Inject Bit Error Routine ──────────────────────────
function injectBitError() {
  if (!builtPacket) { buildAndVisualizePacket(); return; }
  bitErrorIdx = randInt(0, builtPacket.payload.length - 1);
  const corrupted = builtPacket.payload.split('').map((c, i) =>
    i === bitErrorIdx ? String.fromCharCode(c.charCodeAt(0) ^ 0xFF) : c
  ).join('');

  if ($('hex-dump')) {
    $('hex-dump').textContent = buildHexDump(
      builtPacket.srcIP, builtPacket.dstIP,
      builtPacket.srcPort, builtPacket.dstPort,
      builtPacket.ttl, corrupted
    );
  }
  updateDecodedFields(true);
  renderDatagramDiagram(true);
  renderWiresharkTree(builtPacket, true);

  // Update redesigned components
  updatePacketTelemetry();
  renderInteractiveDiagram();
  renderInteractiveHex();
  renderInteractiveBinary();
  selectPacketField('udp_csum');

  updateStatusPill('error', 'Bit Error Detected');
  setStatusMessage(`💥 Bit error injected at payload byte <b>#${bitErrorIdx}</b> ('${builtPacket.payload[bitErrorIdx]}' inverted). Checksum verification failed — receiving stack will silently discard!`);

  pbLogEvent('error', `Bit error injected at payload byte #${bitErrorIdx}`,
    `Inverted byte: '${builtPacket.payload[bitErrorIdx]}' ➔ Checksum mismatch! Datagram will be dropped.`);

  // Animate transit with drop effect
  triggerNetworkTransitAnim(true);
}

// ── Reset Packet Routine ──────────────────────────────
function resetPacket() {
  if ($('src-ip')) $('src-ip').value = '192.168.1.10';
  if ($('dst-ip')) $('dst-ip').value = '192.168.1.20';
  if ($('src-port')) $('src-port').value = 5000;
  if ($('dst-port')) $('dst-port').value = 8080;
  if ($('ttl')) $('ttl').value = 64;
  if ($('payload-data')) $('payload-data').value = 'Hello, UDP-Scope!';

  document.querySelectorAll('.pb-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'text'));

  pbUpdatePayloadMeta();
  buildAndVisualizePacket();

  pbLogEvent('info', 'Packet parameters reset to standard defaults (192.168.1.10:5000 ➔ 192.168.1.20:8080).');
  setStatusMessage('🔄 Packet configuration reset to default parameters.');
}

// ── Update All Dynamic Telemetry Cards (Sections E & G)
function updatePacketTelemetry() {
  if (!builtPacket) return;
  const p = builtPacket;
  const total = p.length + 20;
  const payLen = p.payload.length;
  const bits = total * 8;
  const hasErr = bitErrorIdx >= 0;

  // Section G Stat Cards
  if ($('pa-stat-payload')) $('pa-stat-payload').innerHTML = `${payLen} <small>bytes</small>`;
  if ($('pa-stat-total'))   $('pa-stat-total').innerHTML   = `${total} <small>bytes</small>`;
  if ($('pa-stat-bits'))    $('pa-stat-bits').textContent    = `${bits} bits on wire`;
  if ($('pa-badge-pay-size')) $('pa-badge-pay-size').textContent = `${payLen}B`;

  // Topo IP badges
  if ($('pa-topo-src-ip'))   $('pa-topo-src-ip').textContent   = p.srcIP;
  if ($('pa-topo-src-port')) $('pa-topo-src-port').textContent = p.srcPort;
  if ($('pa-topo-dst-ip'))   $('pa-topo-dst-ip').textContent   = p.dstIP;
  if ($('pa-topo-dst-port')) $('pa-topo-dst-port').textContent = p.dstPort;

  // Section E Sidebar Table
  if ($('pa-info-src-ip'))       $('pa-info-src-ip').textContent       = p.srcIP;
  if ($('pa-info-dst-ip'))       $('pa-info-dst-ip').textContent       = p.dstIP;
  if ($('pa-info-src-port'))     $('pa-info-src-port').textContent     = p.srcPort;
  if ($('pa-info-dst-port'))     $('pa-info-dst-port').textContent     = p.dstPort;
  if ($('pa-info-udp-len'))      $('pa-info-udp-len').textContent      = `${p.length} bytes`;
  if ($('pa-info-ip-total'))     $('pa-info-ip-total').textContent     = `${total} bytes`;
  if ($('pa-info-checksum'))     $('pa-info-checksum').textContent     = hasErr ? `${p.checksum} (INVALID)` : `${p.checksum} (VALID)`;
  if ($('pa-info-payload-size')) $('pa-info-payload-size').textContent = `${payLen} bytes`;
  if ($('pa-info-total-size'))   $('pa-info-total-size').textContent   = `${total} bytes`;

  // Checksum Pill
  const csumPill = $('pa-csum-status-pill');
  if (csumPill) {
    if (hasErr) {
      csumPill.className = 'pa-csum-pill error';
      csumPill.textContent = 'CRC MISMATCH (DROP)';
    } else {
      csumPill.className = 'pa-csum-pill valid';
      csumPill.textContent = 'VALID CHECKSUM';
    }
  }

  // Compat summary
  if ($('pb-payload-size')) $('pb-payload-size').textContent = `${payLen}B`;
  if ($('pb-total-label'))  $('pb-total-label').textContent  = `${total}B`;
}

// ── Interactive 32-Bit Datagram Structure Diagram (Section D)
function renderInteractiveDiagram() {
  const container = $('pa-interactive-diagram');
  if (!container || !builtPacket) return;
  const p = builtPacket;
  const hasErr = bitErrorIdx >= 0;

  function makeRow(cells) {
    const rowEl = document.createElement('div');
    rowEl.className = 'pa-dgram-row';
    cells.forEach(([key, label, pct, layerCls]) => {
      const cell = document.createElement('div');
      cell.className = `pa-field-cell ${layerCls}-cell ${key === selectedFieldKey ? 'selected' : ''}`;
      cell.style.width = `${pct}%`;
      cell.dataset.field = key;

      const def = FIELD_DEFS[key];
      const valStr = def ? def.getValue(p) : '';

      cell.innerHTML = `
        <span class="pa-cell-title">${label}</span>
        <span class="pa-cell-val">${valStr.split('(')[0].trim()}</span>
        <span class="pa-cell-bits">${def ? def.bits.split(' ')[0] : ''}</span>
      `;
      cell.addEventListener('click', () => selectPacketField(key));
      rowEl.appendChild(cell);
    });
    return rowEl;
  }

  container.innerHTML = '';

  // 1. IPv4 Header Section
  const ipSec = document.createElement('div');
  ipSec.className = 'pa-diagram-section';
  ipSec.innerHTML = `<div class="pa-layer-label ip"><span>🌐 IPv4 Header Layer (20 Bytes / 160 Bits)</span><span>RFC 791</span></div>`;
  ipSec.appendChild(makeRow([
    ['ver', 'Ver', 12.5, 'ip'],
    ['ihl', 'IHL', 12.5, 'ip'],
    ['dscp_ecn', 'DSCP/ECN', 25, 'ip'],
    ['total_len', 'Total Length', 50, 'ip']
  ]));
  ipSec.appendChild(makeRow([
    ['ident', 'Identification', 50, 'ip'],
    ['flags_frag', 'Flags & Offset', 50, 'ip']
  ]));
  ipSec.appendChild(makeRow([
    ['ttl', 'TTL', 25, 'ip'],
    ['proto', 'Protocol', 25, 'ip'],
    ['ip_csum', 'Header Checksum', 50, 'ip']
  ]));
  ipSec.appendChild(makeRow([
    ['src_ip', `Source IP: ${p.srcIP}`, 100, 'ip']
  ]));
  ipSec.appendChild(makeRow([
    ['dst_ip', `Destination IP: ${p.dstIP}`, 100, 'ip']
  ]));
  container.appendChild(ipSec);

  // 2. UDP Header Section
  const udpSec = document.createElement('div');
  udpSec.className = 'pa-diagram-section';
  udpSec.innerHTML = `<div class="pa-layer-label udp"><span>📦 UDP Header Layer (8 Bytes / 64 Bits)</span><span>RFC 768</span></div>`;
  udpSec.appendChild(makeRow([
    ['udp_src_port', `Source Port: ${p.srcPort}`, 50, 'udp'],
    ['udp_dst_port', `Dest Port: ${p.dstPort}`, 50, 'udp']
  ]));
  udpSec.appendChild(makeRow([
    ['udp_len', `UDP Length: ${p.length}B`, 50, 'udp'],
    ['udp_csum', hasErr ? `Checksum: ${p.checksum} ❌` : `Checksum: ${p.checksum} ✅`, 50, 'udp']
  ]));
  container.appendChild(udpSec);

  // 3. Payload Section
  const paySec = document.createElement('div');
  paySec.className = 'pa-diagram-section';
  paySec.innerHTML = `<div class="pa-layer-label pay"><span>📝 Application Payload (${p.payload.length} Bytes)</span><span>L7 Data</span></div>`;
  const payClip = p.payload.length > 32 ? p.payload.slice(0, 32) + '…' : p.payload;
  paySec.appendChild(makeRow([
    ['payload', `"${payClip}" (${p.payload.length}B)`, 100, 'pay']
  ]));
  container.appendChild(paySec);
}

// ── Select Packet Field & Synchronize Views ───────────
function selectPacketField(key) {
  selectedFieldKey = key;
  const def = FIELD_DEFS[key];
  if (!def || !builtPacket) return;

  // Update Diagram selection outline
  document.querySelectorAll('.pa-field-cell').forEach(c => {
    c.classList.toggle('selected', c.dataset.field === key);
  });

  // Update Field Explainer Panel (Section D/F)
  const layerBadge = $('fd-layer-badge');
  if (layerBadge) {
    layerBadge.textContent = `${def.layer} Header`;
    layerBadge.className = `pa-field-layer-badge ${def.layer === 'IPv4' ? 'ip' : def.layer === 'UDP' ? 'udp' : 'pay'}`;
  }
  if ($('fd-name'))    $('fd-name').textContent    = def.name;
  if ($('fd-width'))   $('fd-width').textContent   = def.bits;
  if ($('fd-val'))     $('fd-val').textContent     = def.getValue(builtPacket);
  if ($('fd-desc'))    $('fd-desc').textContent    = def.desc;
  if ($('fd-example')) $('fd-example').textContent = def.example;

  // Sync Highlight in Hex View
  syncHexHighlight(def.byteStart, def.byteEnd);

  // Sync Highlight in Binary View
  syncBinaryHighlight(def.byteStart, def.byteEnd);
}

// ── Synchronized Interactive Hexadecimal View (Tab 2) ─
function renderInteractiveHex() {
  const container = $('pa-interactive-hex');
  if (!container || !builtPacket) return;

  const bytes = getRawPacketBytes(builtPacket);
  container.innerHTML = '';

  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const rowEl = document.createElement('div');
    rowEl.className = 'pa-hex-row';

    const addr = i.toString(16).padStart(4, '0').toUpperCase();
    const addrEl = document.createElement('div');
    addrEl.className = 'pa-hex-addr';
    addrEl.textContent = addr;
    rowEl.appendChild(addrEl);

    const bytesEl = document.createElement('div');
    bytesEl.className = 'pa-hex-bytes';

    chunk.forEach((b, offset) => {
      const idx = i + offset;
      const span = document.createElement('span');
      const layerCls = idx < 20 ? 'ip' : idx < 28 ? 'udp' : 'pay';
      span.className = `pa-hex-byte ${layerCls}`;
      span.dataset.byteIdx = idx;
      span.textContent = b.toString(16).padStart(2, '0').toUpperCase();

      span.addEventListener('click', () => {
        // Find which field owns this byte
        for (const [k, f] of Object.entries(FIELD_DEFS)) {
          if (f.byteEnd === -1 ? idx >= f.byteStart : (idx >= f.byteStart && idx <= f.byteEnd)) {
            selectPacketField(k);
            break;
          }
        }
      });
      bytesEl.appendChild(span);
    });
    rowEl.appendChild(bytesEl);

    const asciiEl = document.createElement('div');
    asciiEl.className = 'pa-hex-ascii';
    asciiEl.textContent = '|' + chunk.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('') + '|';
    rowEl.appendChild(asciiEl);

    container.appendChild(rowEl);
  }

  // Restore active field highlight
  if (selectedFieldKey && FIELD_DEFS[selectedFieldKey]) {
    const def = FIELD_DEFS[selectedFieldKey];
    syncHexHighlight(def.byteStart, def.byteEnd);
  }
}

function syncHexHighlight(start, end) {
  document.querySelectorAll('.pa-hex-byte').forEach(el => {
    const idx = parseInt(el.dataset.byteIdx);
    const match = end === -1 ? idx >= start : (idx >= start && idx <= end);
    el.classList.toggle('highlight', match);
  });
}

// ── Synchronized Interactive Binary View (Tab 3) ──────
function renderInteractiveBinary() {
  const container = $('pa-interactive-binary');
  if (!container || !builtPacket) return;

  const bytes = getRawPacketBytes(builtPacket);
  container.innerHTML = '';

  bytes.forEach((b, idx) => {
    const binStr = b.toString(2).padStart(8, '0');
    const lineEl = document.createElement('div');
    const layerCls = idx < 20 ? 'bin-chip-ip' : idx < 28 ? 'bin-chip-udp' : 'bin-chip-pay';
    lineEl.className = 'pa-bin-byte-line';
    lineEl.dataset.byteIdx = idx;

    let fieldOwner = 'Payload';
    for (const [k, f] of Object.entries(FIELD_DEFS)) {
      if (f.byteEnd === -1 ? idx >= f.byteStart : (idx >= f.byteStart && idx <= f.byteEnd)) {
        fieldOwner = f.name;
        break;
      }
    }

    lineEl.innerHTML = `
      <span class="pa-bin-idx">B[${idx.toString().padStart(2, '0')}]</span>
      <span class="pa-bin-name ${layerCls}" title="${fieldOwner}">${fieldOwner.slice(0, 14)}</span>
      <div class="pa-bin-octets">
        ${[...binStr].map((bit, bidx) => `<span class="pa-bin-bit" title="Byte ${idx}, Bit ${7 - bidx}: ${bit}">${bit}</span>`).join('')}
      </div>
      <span style="color:#64748B;font-size:0.72rem;margin-left:auto;">0x${b.toString(16).padStart(2, '0').toUpperCase()}</span>
    `;

    lineEl.addEventListener('click', () => {
      for (const [k, f] of Object.entries(FIELD_DEFS)) {
        if (f.byteEnd === -1 ? idx >= f.byteStart : (idx >= f.byteStart && idx <= f.byteEnd)) {
          selectPacketField(k);
          break;
        }
      }
    });

    container.appendChild(lineEl);
  });

  if (selectedFieldKey && FIELD_DEFS[selectedFieldKey]) {
    const def = FIELD_DEFS[selectedFieldKey];
    syncBinaryHighlight(def.byteStart, def.byteEnd);
  }
}

function syncBinaryHighlight(start, end) {
  document.querySelectorAll('.pa-bin-byte-line').forEach(el => {
    const idx = parseInt(el.dataset.byteIdx);
    const match = end === -1 ? idx >= start : (idx >= start && idx <= end);
    el.classList.toggle('highlight', match);
    el.querySelectorAll('.pa-bin-bit').forEach(b => b.classList.toggle('highlight', match));
  });
}

// ── 5-Stage Datagram Assembly State Machine (Section C)
function setPaStage(stageNum) {
  paStage = Math.max(1, Math.min(5, stageNum));

  // Update pills
  document.querySelectorAll('.pa-stage-pill').forEach(pill => {
    const s = parseInt(pill.dataset.stage);
    pill.classList.toggle('active', s === paStage);
  });

  // Update fill bar: 0%, 25%, 50%, 75%, 100%
  const fill = $('pa-stage-fill');
  if (fill) fill.style.width = `${(paStage - 1) * 25}%`;

  // Update Explainer
  const info = PA_STAGE_INFO[paStage];
  if (info) {
    if ($('pa-stage-badge')) $('pa-stage-badge').textContent = info.badge;
    if ($('pa-stage-text'))  $('pa-stage-text').textContent  = info.desc;
  }

  // Highlight active layer in diagram
  if (paStage === 1) selectPacketField('payload');
  else if (paStage === 2) selectPacketField('udp_dst_port');
  else if (paStage === 3) selectPacketField('dst_ip');
  else if (paStage === 4) selectPacketField('total_len');
  else if (paStage === 5) selectPacketField(selectedFieldKey || 'udp_dst_port');
}

function playPaStages() {
  if (paStagePlaying) {
    pausePaStages();
    return;
  }
  paStagePlaying = true;
  const playBtn = $('btn-stage-play');
  if (playBtn) playBtn.textContent = '⏸ Pause';

  if (paStage >= 5) setPaStage(1);

  paStageTimer = setInterval(() => {
    if (paStage < 5) {
      setPaStage(paStage + 1);
    } else {
      pausePaStages();
    }
  }, 900);
}

function pausePaStages() {
  paStagePlaying = false;
  if (paStageTimer) clearInterval(paStageTimer);
  const playBtn = $('btn-stage-play');
  if (playBtn) playBtn.textContent = '▶ Play';
}

function replayPaStages() {
  pausePaStages();
  setPaStage(1);
  playPaStages();
}

// ── Network Topology Canvas Simulation (Section B) ───
function initCarrierParticles(w, h) {
  paCarrierParticles.length = 0;
  for (let i = 0; i < 22; i++) {
    paCarrierParticles.push({
      x: Math.random() * w,
      speed: 0.8 + Math.random() * 1.4,
      size: 1.5 + Math.random() * 2,
      hop: Math.random() > 0.5 ? 1 : 2,
      alpha: 0.3 + Math.random() * 0.5
    });
  }
}

function triggerNetworkTransitAnim(isError) {
  paTransitState.active   = true;
  paTransitState.progress = 0;
  paTransitState.isError  = isError;
  paTransitState.speed    = 0.011;

  updateStatusPill('transmitting', 'Transmitting');
  const hud = $('pa-net-hud-status');
  if (hud) hud.innerHTML = '<b>Transmitting: Sender ➔ Router (Hop 1)</b>';
}

function startPaNetworkAnimation() {
  if (paNetAnimId) cancelAnimationFrame(paNetAnimId);

  function netLoop(timestamp) {
    if (!paNetCtx || !paNetCanvas) return;
    const ctx = paNetCtx;
    const W = paNetCanvas.width / (window.devicePixelRatio || 1);
    const H = paNetCanvas.height / (window.devicePixelRatio || 1);

    if (paCarrierParticles.length === 0) initCarrierParticles(W, H);

    ctx.clearRect(0, 0, W, H);

    // Background gradient glow
    const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.6);
    bgGrad.addColorStop(0, '#101726');
    bgGrad.addColorStop(1, '#0B0F17');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 35) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Node coordinates
    const sx = W * 0.14, sy = H * 0.52;
    const rx = W * 0.50, ry = H * 0.52;
    const dx = W * 0.86, dy = H * 0.52;

    // Draw Connection Cables
    // Link 1: Sender -> Router
    const grad1 = ctx.createLinearGradient(sx, sy, rx, ry);
    grad1.addColorStop(0, '#3B82F6');
    grad1.addColorStop(1, '#8B7CFF');
    ctx.strokeStyle = grad1;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#3B82F6';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(rx, ry);
    ctx.stroke();

    // Link 2: Router -> Receiver
    const grad2 = ctx.createLinearGradient(rx, ry, dx, dy);
    grad2.addColorStop(0, '#8B7CFF');
    grad2.addColorStop(1, '#22C55E');
    ctx.strokeStyle = grad2;
    ctx.shadowColor = '#22C55E';
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(dx, dy);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Carrier background pulses
    ctx.fillStyle = '#60A5FA';
    paCarrierParticles.forEach(pt => {
      pt.x += pt.speed;
      if (pt.hop === 1 && pt.x > rx) pt.x = sx;
      if (pt.hop === 2 && pt.x > dx) pt.x = rx;
      if (pt.x > W) pt.x = 0;

      const py = sy;
      ctx.globalAlpha = pt.alpha;
      ctx.beginPath();
      ctx.arc(pt.x, py, pt.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // ── Draw Device 1: Sender Host ──
    ctx.save();
    // Monitor bezel
    ctx.fillStyle = '#141B27';
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2;
    rRect(ctx, sx - 32, sy - 40, 64, 46, 6);
    ctx.fill();
    ctx.stroke();
    // Screen display
    ctx.fillStyle = '#1D283A';
    rRect(ctx, sx - 26, sy - 34, 52, 34, 4);
    ctx.fill();
    // Terminal lines
    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(sx - 20, sy - 28, 20, 3);
    ctx.fillStyle = '#60A5FA';
    ctx.fillRect(sx - 20, sy - 21, 32, 2);
    ctx.fillRect(sx - 20, sy - 15, 24, 2);
    // Stand
    ctx.fillStyle = '#233044';
    ctx.fillRect(sx - 6, sy + 6, 12, 10);
    ctx.fillRect(sx - 18, sy + 16, 36, 4);
    // Labels
    ctx.fillStyle = '#F3F4F6';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sender Host', sx, sy + 32);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '10px monospace';
    const sPort = builtPacket ? builtPacket.srcPort : 5000;
    ctx.fillText(`192.168.1.10 : ${sPort}`, sx, sy + 44);
    ctx.restore();

    // ── Draw Device 2: Router Gateway ──
    ctx.save();
    const routerPulse = Math.sin(timestamp * 0.005) * 0.5 + 0.5;
    // Outer radar ring
    ctx.strokeStyle = `rgba(139, 124, 255, ${0.2 + routerPulse * 0.25})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(rx, ry, 28 + routerPulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    // Router body
    ctx.fillStyle = '#141B27';
    ctx.strokeStyle = '#8B7CFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rx, ry, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 4 Directional Routing Arrows
    ctx.strokeStyle = '#C4B5FD';
    ctx.lineWidth = 2;
    // Horizontal cross
    ctx.beginPath();
    ctx.moveTo(rx - 12, ry); ctx.lineTo(rx + 12, ry);
    ctx.moveTo(rx, ry - 12); ctx.lineTo(rx, ry + 12);
    ctx.stroke();
    // Arrow tips
    ctx.fillStyle = '#C4B5FD';
    ctx.beginPath();
    ctx.moveTo(rx + 12, ry); ctx.lineTo(rx + 8, ry - 4); ctx.lineTo(rx + 8, ry + 4); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(rx - 12, ry); ctx.lineTo(rx - 8, ry - 4); ctx.lineTo(rx - 8, ry + 4); ctx.fill();
    // Labels
    ctx.fillStyle = '#F3F4F6';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Gateway Router', rx, ry + 36);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '10px monospace';
    ctx.fillText('192.168.1.1 (MTU 1500)', rx, ry + 48);
    ctx.restore();

    // ── Draw Device 3: Receiver Host ──
    ctx.save();
    // Server rack chassis
    ctx.fillStyle = '#141B27';
    ctx.strokeStyle = '#22C55E';
    ctx.lineWidth = 2;
    rRect(ctx, dx - 26, sy - 42, 52, 54, 6);
    ctx.fill();
    ctx.stroke();
    // 3 Server blades with blinking LEDs
    for (let b = 0; b < 3; b++) {
      const by = sy - 36 + b * 16;
      ctx.fillStyle = '#1D283A';
      rRect(ctx, dx - 20, by, 40, 11, 3);
      ctx.fill();
      // LED lights
      const ledOn = Math.sin(timestamp * 0.006 + b) > 0;
      ctx.fillStyle = ledOn ? '#22C55E' : '#14532D';
      ctx.beginPath();
      ctx.arc(dx + 12, by + 5.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#60A5FA';
      ctx.fillRect(dx - 16, by + 4, 18, 2.5);
    }
    // Labels
    ctx.fillStyle = '#F3F4F6';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Receiver Host', dx, dy + 32);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '10px monospace';
    const dPort = builtPacket ? builtPacket.dstPort : 8080;
    ctx.fillText(`192.168.1.20 : ${dPort}`, dx, dy + 44);
    ctx.restore();

    // ── Draw Transit Datagram Capsule ──
    if (paTransitState.active) {
      paTransitState.progress += paTransitState.speed;
      const prog = paTransitState.progress;

      let curX, curY;
      const hud = $('pa-net-hud-status');

      if (prog < 0.45) {
        // Hop 1: Sender -> Router
        const t = prog / 0.45;
        curX = sx + (rx - sx) * t;
        curY = sy;
        if (hud) hud.innerHTML = '<b>In Transit: Sender ➔ Router (Hop 1)</b>';
      } else if (prog < 0.55) {
        // Router inspection delay
        curX = rx;
        curY = ry;
        if (hud) hud.innerHTML = '<b>Inspecting IP Destination: 192.168.1.20 ➔ Route OK</b>';
      } else if (prog < 1.0) {
        // Hop 2: Router -> Receiver
        const t = (prog - 0.55) / 0.45;
        curX = rx + (dx - rx) * t;
        curY = dy;
        if (hud) hud.innerHTML = '<b>In Transit: Router ➔ Receiver (Hop 2)</b>';
      } else {
        // Arrived at Receiver!
        paTransitState.active = false;
        if (paTransitState.isError) {
          // Checksum error explosion
          for (let i = 0; i < 18; i++) {
            paDeliveryRipples.push({
              x: dx, y: dy, r: 4, maxR: 45,
              color: '#EF4444', alpha: 1, isError: true
            });
          }
          if (hud) hud.innerHTML = '<b style="color:#EF4444">💥 Checksum Mismatch! Datagram Dropped at Socket Layer.</b>';
          updateStatusPill('error', 'Bit Error Detected');
          setStatusMessage(`⚠ Datagram received at 192.168.1.20:${dPort} failed 16-bit UDP Checksum verification! Operating system dropped the packet silently.`);
        } else {
          // Delivery success rings
          for (let i = 0; i < 3; i++) {
            paDeliveryRipples.push({
              x: dx, y: dy, r: 8 + i * 10, maxR: 55,
              color: '#22C55E', alpha: 1, isError: false
            });
          }
          if (hud) hud.innerHTML = '<b style="color:#22C55E">✓ Delivered! RTT: 12ms | Loss: 0%</b>';
          updateStatusPill('ready', 'Packet Ready');
          setStatusMessage(`✓ Datagram delivered to listening application socket at 192.168.1.20:${dPort}. Verification passed.`);
        }
      }

      // Render 3-section Datagram Capsule
      if (paTransitState.active) {
        ctx.save();
        const capW = 60, capH = 22;
        const cx = curX - capW / 2, cy = curY - capH / 2;

        // Shadow & glow
        ctx.shadowColor = paTransitState.isError ? '#EF4444' : '#3B82F6';
        ctx.shadowBlur = 12;

        // Capsule background container
        ctx.fillStyle = '#141B27';
        ctx.strokeStyle = paTransitState.isError ? '#EF4444' : '#60A5FA';
        ctx.lineWidth = 1.5;
        rRect(ctx, cx, cy, capW, capH, 6);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 3 Segmented Color Bands
        // 1. IPv4 (Purple)
        ctx.fillStyle = '#8B7CFF';
        rRect(ctx, cx + 2, cy + 2, 18, capH - 4, 3);
        ctx.fill();
        // 2. UDP (Blue)
        ctx.fillStyle = '#2585F7';
        rRect(ctx, cx + 22, cy + 2, 16, capH - 4, 3);
        ctx.fill();
        // 3. Payload (Coral or Red)
        ctx.fillStyle = paTransitState.isError ? '#EF4444' : '#F04466';
        rRect(ctx, cx + 40, cy + 2, 18, capH - 4, 3);
        ctx.fill();

        // Tiny text tags
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 7px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('IP', cx + 11, cy + 14);
        ctx.fillText('UDP', cx + 30, cy + 14);
        ctx.fillText('DATA', cx + 49, cy + 14);

        ctx.restore();
      }
    }

    // ── Draw Delivery Ripples / Explosions ──
    for (let r = paDeliveryRipples.length - 1; r >= 0; r--) {
      const rip = paDeliveryRipples[r];
      rip.r += rip.isError ? 1.8 : 1.2;
      rip.alpha -= 0.025;
      if (rip.alpha <= 0 || rip.r >= rip.maxR) {
        paDeliveryRipples.splice(r, 1);
        continue;
      }
      ctx.save();
      ctx.strokeStyle = rip.color;
      ctx.lineWidth = rip.isError ? 2 : 2.5;
      ctx.globalAlpha = Math.max(0, rip.alpha);
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    paNetAnimId = requestAnimationFrame(netLoop);
  }

  paNetAnimId = requestAnimationFrame(netLoop);
}

// ── Wireshark-Style Protocol Tree (Tab 1) ──────────────
function renderWiresharkTree(p, hasError) {
  const root = $('ws-tree-root');
  if (!root || !p) return;

  const totalLen = p.length + 20;

  root.innerHTML = `
    <!-- Frame Layer -->
    <div class="ws-tree-node expanded">
      <div class="ws-tree-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="ws-tree-icon">▶</span>
        <span><b>Frame 1:</b> ${totalLen} bytes on wire (${totalLen * 8} bits)</span>
      </div>
      <div class="ws-tree-children">
        <div class="ws-tree-item">Arrival Time: ${new Date().toISOString()}</div>
        <div class="ws-tree-item">Frame Number: 1</div>
        <div class="ws-tree-item">Frame Length: ${totalLen} bytes (${totalLen * 8} bits)</div>
      </div>
    </div>

    <!-- Ethernet II Layer -->
    <div class="ws-tree-node">
      <div class="ws-tree-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="ws-tree-icon">▶</span>
        <span><b>Ethernet II,</b> Src: 00:1a:2b:3c:4d:5e, Dst: 00:50:56:c0:00:08</span>
      </div>
      <div class="ws-tree-children">
        <div class="ws-tree-item">Destination: VMware_c0:00:08 (00:50:56:c0:00:08)</div>
        <div class="ws-tree-item">Source: Intel_3c:4d:5e (00:1a:2b:3c:4d:5e)</div>
        <div class="ws-tree-item">Type: IPv4 (0x0800)</div>
      </div>
    </div>

    <!-- IPv4 Layer -->
    <div class="ws-tree-node expanded">
      <div class="ws-tree-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="ws-tree-icon">▶</span>
        <span><b>Internet Protocol Version 4,</b> Src: ${p.srcIP}, Dst: ${p.dstIP}</span>
      </div>
      <div class="ws-tree-children">
        <div class="ws-tree-item">0100 .... = Version: 4</div>
        <div class="ws-tree-item">.... 0101 = Header Length: 20 bytes (5)</div>
        <div class="ws-tree-item">Total Length: ${totalLen} bytes</div>
        <div class="ws-tree-item">Identification: 0x0001 (1)</div>
        <div class="ws-tree-item">Flags: 0x4000, Don't fragment</div>
        <div class="ws-tree-item">Time to Live: ${p.ttl}</div>
        <div class="ws-tree-item">Protocol: UDP (17)</div>
        <div class="ws-tree-item">Header Checksum: 0x0000 [validation disabled]</div>
        <div class="ws-tree-item">Source Address: ${p.srcIP}</div>
        <div class="ws-tree-item">Destination Address: ${p.dstIP}</div>
      </div>
    </div>

    <!-- UDP Layer -->
    <div class="ws-tree-node expanded">
      <div class="ws-tree-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="ws-tree-icon">▶</span>
        <span><b>User Datagram Protocol,</b> Src Port: ${p.srcPort}, Dst Port: ${p.dstPort}</span>
      </div>
      <div class="ws-tree-children">
        <div class="ws-tree-item">Source Port: <b>${p.srcPort}</b></div>
        <div class="ws-tree-item">Destination Port: <b>${p.dstPort}</b></div>
        <div class="ws-tree-item">Length: <b>${p.length}</b> bytes (Header + Payload)</div>
        <div class="ws-tree-item">Checksum: <b>${p.checksum}</b> ${hasError ? '<span style="color:#ef4444;font-weight:700">[INCORRECT - CRC MISMATCH]</span>' : '<span style="color:#22c55e;font-weight:700">[CORRECT]</span>'}</div>
        <div class="ws-tree-item">UDP Payload: (${p.payload.length} bytes)</div>
      </div>
    </div>

    <!-- Data Layer -->
    <div class="ws-tree-node expanded">
      <div class="ws-tree-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="ws-tree-icon">▶</span>
        <span><b>Data:</b> (${p.payload.length} bytes) "${p.payload.slice(0, 25)}${p.payload.length > 25 ? '…' : ''}"</span>
      </div>
      <div class="ws-tree-children">
        <div class="ws-tree-item">Data Length: ${p.payload.length} bytes</div>
        <div class="ws-tree-item">Raw String: "${p.payload}"</div>
      </div>
    </div>
  `;
}

function updateDecodedFields(hasError) {
  if (!builtPacket) return;
  const p = builtPacket;
  const groups = [
    { cls: 'ip-field-row', rows: [
      ['IPv4 Version', '4'], ['IHL (Header Len)', '20 bytes (5×4)'],
      ['Total Length', `${p.length + 20} bytes`], ['TTL (Time to Live)', p.ttl],
      ['Protocol', '17 (UDP / 0x11)'], ['Source IP', p.srcIP], ['Destination IP', p.dstIP]
    ]},
    { cls: 'udp-field-row', rows: [
      ['Source Port', p.srcPort], ['Destination Port', p.dstPort],
      ['UDP Length', `${p.length} bytes`],
      ['Checksum', hasError ? `${p.checksum} ❌ MISMATCH` : `${p.checksum} ✅ VALID`]
    ]},
    { cls: 'pay-field-row', rows: [
      ['Payload String', `"${p.payload.slice(0, 30)}${p.payload.length > 30 ? '…' : ''}"`],
      ['Payload Bytes', `${p.payload.length} bytes`]
    ]}
  ];

  const df = $('decoded-fields');
  if (df) {
    df.innerHTML = groups.map(g =>
      g.rows.map(([n, v]) => `
        <div class="decoded-field ${g.cls}">
          <span class="field-name">${n}</span>
          <span class="field-value${hasError && n === 'Checksum' ? ' err' : ''}">${v}</span>
        </div>`).join('')
    ).join('');
  }
}

function renderDatagramDiagram(hasError) {
  const cont = $('pb-datagram');
  if (!cont || !builtPacket) return;
  const p = builtPacket;

  function row(offset, fields) {
    const cells = fields.map(([label, pct, cls, title]) =>
      `<div class="dgram-field ${cls}" style="width:${pct}%" title="${title || label}">${label}</div>`
    ).join('');
    return `<div class="dgram-row"><div class="dgram-offset">${offset}</div>${cells}</div>`;
  }

  const payClip = p.payload.slice(0, 24) + (p.payload.length > 24 ? '…' : '');

  cont.innerHTML = `
    <div class="dgram-header-label" style="color:#a5b4fc">🌐 IPv4 Header Layer (20 bytes)</div>
    ${row(0,  [['Ver=4', 12.5, 'ip-field', 'IPv4'], ['IHL=5', 12.5, 'ip-field', 'Header Len 20B'], ['DSCP/ECN', 25, 'ip-field', 'DiffServ'], ['Total Len: ' + (p.length + 20) + 'B', 50, 'ip-field', 'Total IP Datagram Length']])}
    ${row(4,  [['ID: 0x0001', 50, 'ip-field', 'Fragment ID'], ['Flags: DF=1, MF=0', 50, 'ip-field', 'Fragmentation Control']])}
    ${row(8,  [['TTL: ' + p.ttl, 25, 'ip-field', 'Time to Live'], ['Proto: 17', 25, 'ip-field', 'Protocol 17 UDP'], ['Hdr Checksum', 50, 'ip-field', 'IPv4 Header Checksum']])}
    ${row(12, [['Source IP: ' + p.srcIP, 100, 'ip-field', 'Sender IP']])}
    ${row(16, [['Destination IP: ' + p.dstIP, 100, 'ip-field', 'Target IP']])}

    <div class="dgram-header-label" style="color:#93c5fd">📦 UDP Header Layer (8 bytes)</div>
    ${row(20, [['Src Port: ' + p.srcPort, 50, 'udp-field', 'Source Application Port'], ['Dst Port: ' + p.dstPort, 50, 'udp-field', 'Destination Service Port']])}
    ${row(24, [['Length: ' + p.length + 'B', 50, 'udp-field', 'UDP Header + Data Length'], ['Checksum: ' + p.checksum, 50, 'udp-field', '16-Bit Checksum Word']])}

    <div class="dgram-header-label" style="color:#fca5a5">📝 Payload (${p.payload.length} bytes)</div>
    ${row(28, [['"' + payClip + '"', 100, hasError ? 'pay-field err-field' : 'pay-field', 'Application Data Payload']])}
  `;
}

// ── Event Log Implementation ──────────────────────────
const LOG_ICONS = { build: '🔨', send: '📤', error: '💥', info: 'ℹ️' };

function pbLogEvent(type, msg, detail) {
  const ts = new Date().toLocaleTimeString('en', { hour12: false });
  const entry = { type, msg, detail: detail || '', ts };
  pbLogData.push(entry);
  renderLogEntry(entry);
  const cnt = $('pb-log-count');
  if (cnt) cnt.textContent = `${pbLogData.length} events`;
}

function renderLogEntry(entry) {
  const cont = $('pb-log-entries');
  if (!cont) return;
  const placeholder = cont.querySelector('.pb-log-empty');
  if (placeholder) placeholder.remove();

  const el = document.createElement('div');
  el.className = `pb-log-entry type-${entry.type}`;
  el.dataset.logtype = entry.type;
  if (pbLogFilter !== 'all' && pbLogFilter !== entry.type) el.hidden = true;
  el.innerHTML = `
    <span class="pb-log-icon">${LOG_ICONS[entry.type] || '•'}</span>
    <div class="pb-log-body">
      <div class="pb-log-msg">${entry.msg}</div>
      ${entry.detail ? `<div class="pb-log-detail">${entry.detail}</div>` : ''}
    </div>
    <span class="pb-log-ts">${entry.ts}</span>
  `;
  if (entry.detail) el.addEventListener('click', () => el.classList.toggle('expanded'));
  cont.appendChild(el);
  cont.scrollTop = cont.scrollHeight;
}

function pbFilterLog(filter) {
  pbLogFilter = filter;
  document.querySelectorAll('.pb-log-entry').forEach(el => {
    el.hidden = filter !== 'all' && el.dataset.logtype !== filter;
  });
}

function pbToggle(section) {
  const card = $(`pb-card-${section}`);
  if (card) card.classList.toggle('collapsed');
}

function pbSwitchMiniTab(tabName) {
  document.querySelectorAll('.pb-mini-tab').forEach(t => t.classList.toggle('active', t.dataset.pbtab === tabName));
  ['inspector', 'datagram', 'hex', 'fields'].forEach(name => {
    const mc = $(`pb-mc-${name}`);
    if (mc) mc.classList.toggle('active', name === tabName);
  });
}

function pbSwitchInspectorTab(tabKey) {
  document.querySelectorAll('.pa-insp-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabKey));
  ['diagram', 'hex', 'binary'].forEach(k => {
    const el = $(`pa-tab-${k}`);
    if (el) el.classList.toggle('active', k === tabKey);
  });
}

function pbUpdatePayloadMeta() {
  const txt = $('payload-data') ? $('payload-data').value : '';
  const chars = txt.length;
  const bytes = new TextEncoder().encode(txt).length;
  const total = 20 + 8 + bytes;
  if ($('pb-char-count')) $('pb-char-count').textContent = chars;
  if ($('pb-byte-count')) $('pb-byte-count').textContent = bytes;
  if ($('pb-total-size')) $('pb-total-size').textContent = total;
}

const PB_PAYLOADS = {
  text: 'Hello, UDP-Scope!',
  dns:  '\\x00\\x01\\x01\\x00\\x00\\x01\\x00\\x00\\x00\\x00\\x00\\x00\\x06google\\x03com\\x00\\x00\\x01\\x00\\x01',
  ntp:  '\\x1b' + '\\x00'.repeat(47),
  game: 'POS|x=128.5|y=64.2|z=0.0|seq=1042|ts=1698000000'
};

const PB_PORT_HINTS = {
  text: { dst: '8080' },
  dns:  { dst: '53' },
  ntp:  { dst: '123' },
  game: { dst: '7777' }
};

function pbSetPayloadType(type) {
  document.querySelectorAll('.pb-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  const ta = $('payload-data');
  if (ta) ta.value = PB_PAYLOADS[type] || '';
  const hint = PB_PORT_HINTS[type];
  if (hint && $('dst-port')) {
    $('dst-port').value = hint.dst;
  }
  pbUpdatePayloadMeta();
}


//  MODULE 6: CHECKSUM TAB FULL ENGINE
// ══════════════════════════════════════════════════════
const csCanvas   = $('cs-canvas');
const csCtx      = csCanvas ? csCanvas.getContext('2d') : null;
const csVCanvas  = $('cs-verify-canvas');
const csVCtx     = csVCanvas ? csVCanvas.getContext('2d') : null;
let csAnimId     = null;
let csSpeed      = 1;
let csSteps      = [];
let csActiveStep = -1;
let csCorrupt    = false;

function ip2words(ip) {
  const b = ip.split('.').map(Number);
  return [(b[0] << 8) | b[1], (b[2] << 8) | b[3]];
}

function computeChecksumSteps(srcIP, dstIP, srcPort, dstPort, payload) {
  const steps = [];
  let sum = 0;

  function addWord(word, label, group) {
    const prev = sum;
    sum += word;
    while (sum > 0xFFFF) sum = (sum & 0xFFFF) + (sum >> 16);
    steps.push({ word, runningSum: sum, prevSum: prev, label, group });
  }

  // 12-byte Pseudo-Header
  const [s1, s2] = ip2words(srcIP);
  const [d1, d2] = ip2words(dstIP);
  addWord(s1, `Src IP High: ${srcIP.split('.').slice(0,2).join('.')}`, 'pseudo');
  addWord(s2, `Src IP Low: ${srcIP.split('.').slice(2,4).join('.')}`, 'pseudo');
  addWord(d1, `Dst IP High: ${dstIP.split('.').slice(0,2).join('.')}`, 'pseudo');
  addWord(d2, `Dst IP Low: ${dstIP.split('.').slice(2,4).join('.')}`, 'pseudo');
  addWord(0x0011, `Zero (0) + Protocol: 17 (UDP)`, 'pseudo');

  const udpLen = 8 + payload.length;
  addWord(udpLen, `UDP Length: ${udpLen} bytes`, 'pseudo');

  // UDP Header
  addWord(srcPort, `Source Port: ${srcPort}`, 'udp');
  addWord(dstPort, `Dest Port: ${dstPort}`, 'udp');
  addWord(udpLen,  `UDP Length: ${udpLen}`, 'udp');
  addWord(0x0000,  `Checksum placeholder: 0x0000`, 'udp');

  // Payload
  const bytes = [...payload].map(c => c.charCodeAt(0));
  for (let i = 0; i < bytes.length; i += 2) {
    const b1 = bytes[i];
    const b2 = (i + 1 < bytes.length) ? bytes[i + 1] : 0;
    const w  = (b1 << 8) | b2;
    const c1 = String.fromCharCode(b1);
    const c2 = (i + 1 < bytes.length) ? String.fromCharCode(b2) : '\\0';
    addWord(w, `Payload: '${c1}${c2}'`, 'payload');
  }

  const checksum = (~sum) & 0xFFFF;
  return { steps, checksum, sum };
}

function resizeCsCanvas() {
  if (!csCanvas) return;
  csCanvas.width  = csCanvas.parentElement.clientWidth - 28;
  csCanvas.height = 420;
}

async function runChecksumCompute() {
  csCorrupt = false;
  const srcIP   = $('cs-src-ip').value   || '192.168.1.10';
  const dstIP   = $('cs-dst-ip').value   || '192.168.1.20';
  const srcPort = parseInt($('cs-src-port').value) || 5000;
  const dstPort = parseInt($('cs-dst-port').value) || 8080;
  const payload = $('cs-payload').value || 'Hello UDP-Scope!';

  const { steps, checksum } = computeChecksumSteps(srcIP, dstIP, srcPort, dstPort, payload);
  csSteps = steps;

  $('cs-result-val').textContent    = 'Computing…';
  $('cs-result-val').className      = 'cs-result-value';
  $('cs-result-status').textContent = '';
  $('cs-result-status').className   = 'cs-result-status';
  $('cs-result-box').className      = 'cs-result-box';
  $('cs-verify-section').style.display = 'none';

  const pills = $('cs-step-pills');
  pills.innerHTML = '';
  steps.forEach((s, i) => {
    const pill = document.createElement('span');
    pill.className = 'cs-step-pill';
    pill.textContent = i + 1;
    pill.addEventListener('click', () => highlightStep(i));
    pills.appendChild(pill);
  });

  $('cs-steps-list').innerHTML = '';
  $('cs-bit-table').innerHTML  = '';

  if (csAnimId) cancelAnimationFrame(csAnimId);
  resizeCsCanvas();

  const delay = Math.max(80, 500 / csSpeed);
  for (let i = 0; i < steps.length; i++) {
    csActiveStep = i;
    highlightStep(i);
    addStepCard(steps[i], i);
    addBitRow(steps[i], i);
    drawChecksumCanvas(steps, i);
    await sleep(delay);
  }

  // Result
  $('cs-result-val').textContent = hex16(checksum);
  $('cs-result-val').className   = 'cs-result-value pass';
  $('cs-result-status').textContent = '✅ Checksum computed successfully';
  $('cs-result-status').className   = 'cs-result-status pass';
  $('cs-result-box').className      = 'cs-result-box pass';
  $('cs-anim-label').textContent    = `Checksum Word = ${hex16(checksum)} ✅`;

  document.querySelectorAll('.cs-step-pill').forEach(p => p.classList.add('done'));
  drawChecksumCanvas(steps, steps.length - 1, checksum);
}

function highlightStep(idx) {
  csActiveStep = idx;
  document.querySelectorAll('.cs-step-pill').forEach((p, i) => {
    p.classList.toggle('active', i === idx);
    if (i < idx) p.classList.add('done');
  });
  document.querySelectorAll('.cs-step-item').forEach((c, i) => {
    c.classList.toggle('active-step', i === idx);
  });
  if (csSteps.length > 0) drawChecksumCanvas(csSteps, idx);
}

function addStepCard(step, idx) {
  const list = $('cs-steps-list');
  const card = document.createElement('div');
  card.className = 'cs-step-item';
  const groupColors = { pseudo: '#6366f1', udp: '#2563eb', payload: '#be123c' };
  card.style.borderLeftColor = groupColors[step.group] || '#58a6ff';
  card.style.borderLeftWidth = '4px';
  card.innerHTML = `
    <div style="font-weight:700;font-size:0.95rem">${idx + 1}. ${step.label}</div>
    <div class="cs-step-hex">+ ${hex16(step.word)} ➔ Sum = ${hex16(step.runningSum)}</div>
    <div style="font-size:0.84rem;color:#a0aec0;font-family:monospace">${bin16(step.word)}</div>
  `;
  card.addEventListener('click', () => highlightStep(idx));
  list.appendChild(card);
  list.scrollTop = list.scrollHeight;
}

function addBitRow(step, idx) {
  const table = $('cs-bit-table');
  table.innerHTML += `
    <div class="cs-bit-row">
      <span class="cs-bit-label">${idx + 1}. ${step.label.split(':')[0]}</span>
      <span class="cs-bit-val">${bin16(step.word)}</span>
      <span class="cs-bit-hex">${hex16(step.word)}</span>
    </div>
  `;
}

function drawChecksumCanvas(steps, activeIdx, finalChecksum) {
  if (!csCtx) return;
  const ctx = csCtx;
  const W   = csCanvas.width, H = csCanvas.height;
  ctx.clearRect(0, 0, W, H);

  const pad = 16;
  const boxH = 26;
  const gap = 4;
  const maxVisible = Math.floor((H - 120) / (boxH + gap));
  const startIdx   = Math.max(0, activeIdx - maxVisible + 3);

  ctx.fillStyle = '#f0f6fc'; ctx.font = 'bold 14px "Segoe UI"';
  ctx.textAlign = 'center'; ctx.fillText('16-Bit One\'s Complement Word Addition & Carry Wrap', W / 2, 20);

  ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
  ctx.fillText('Step #', pad, 42);
  ctx.fillText('Hex Word', pad + 55, 42);
  ctx.fillText('Binary (16-bit register)', W / 2 - 50, 42);
  ctx.textAlign = 'right';
  ctx.fillText('Accumulated Sum', W - pad, 42);

  const groupColors = { pseudo: '#6366f1', udp: '#2563eb', payload: '#be123c' };

  let y = 52;
  for (let i = startIdx; i <= activeIdx && i < steps.length; i++) {
    const s = steps[i];
    const isActive = i === activeIdx;
    const color = groupColors[s.group] || '#58a6ff';

    ctx.fillStyle = isActive ? color + '44' : color + '18';
    ctx.strokeStyle = isActive ? color : color + '55';
    ctx.lineWidth = isActive ? 2 : 1;
    rRect(ctx, pad, y, W - pad * 2, boxH, 4);

    ctx.fillStyle = isActive ? '#fff' : '#a0aec0';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}.`, pad + 6, y + boxH / 2 + 4);
    ctx.fillText(hex16(s.word), pad + 55, y + boxH / 2 + 4);

    ctx.fillStyle = isActive ? '#e3b341' : '#cbd5e1';
    ctx.fillText(bin16(s.word), W / 2 - 60, y + boxH / 2 + 4);

    ctx.textAlign = 'right';
    ctx.fillStyle = isActive ? '#39d353' : '#38bdf8';
    ctx.fillText(hex16(s.runningSum), W - pad - 6, y + boxH / 2 + 4);

    y += boxH + gap;
  }

  // Result box at bottom
  const bottomY = H - 50;
  if (finalChecksum !== undefined) {
    const col = csCorrupt ? '#f85149' : '#39d353';
    ctx.fillStyle = col + '22'; ctx.strokeStyle = col; ctx.lineWidth = 2;
    rRect(ctx, W / 2 - 130, bottomY, 260, 34, 8);
    ctx.fillStyle = col; ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Final Checksum = ${hex16(finalChecksum)} ${csCorrupt ? '❌' : '✓'}`, W / 2, bottomY + 22);
  }
}

async function runCorruptVerify() {
  await runChecksumCompute();
  csCorrupt = true;

  const srcIP   = $('cs-src-ip').value   || '192.168.1.10';
  const dstIP   = $('cs-dst-ip').value   || '192.168.1.20';
  const srcPort = parseInt($('cs-src-port').value) || 5000;
  const dstPort = parseInt($('cs-dst-port').value) || 8080;
  const payload = $('cs-payload').value || 'Hello UDP-Scope!';

  const { checksum } = computeChecksumSteps(srcIP, dstIP, srcPort, dstPort, payload);

  // Corrupt one byte
  const corruptIdx = randInt(0, payload.length - 1);
  const corruptedPayload = [...payload].map((c, i) =>
    i === corruptIdx ? String.fromCharCode(c.charCodeAt(0) ^ randInt(1, 255)) : c
  ).join('');

  const { sum: vSum } = computeChecksumSteps(srcIP, dstIP, srcPort, dstPort, corruptedPayload);
  let receiverCheck = (vSum + checksum) & 0xFFFF;
  while (receiverCheck > 0xFFFF) receiverCheck = (receiverCheck & 0xFFFF) + (receiverCheck >> 16);

  const isAllOnes = receiverCheck === 0xFFFF;

  $('cs-verify-section').style.display = 'block';
  $('cs-verify-body').innerHTML = `
    <p>Original payload: <code>"${payload}"</code></p>
    <p>💥 Corrupted byte at position #${corruptIdx}: <code>"${corruptedPayload}"</code></p>
    <p>Sender's Checksum Word: <code>${hex16(checksum)}</code></p>
    <p>Receiver Computed Sum: <code>${hex16(vSum)}</code></p>
    <p>Receiver Verification: <code>${hex16(vSum)} + ${hex16(checksum)} = ${hex16(vSum + checksum)}</code></p>
    <p>${isAllOnes ? '<span style="color:#3fb950;font-weight:700">Result = 0xFFFF ➔ Valid!</span>' : '<span style="color:#f85149;font-weight:700">Result ≠ 0xFFFF ➔ FAILED: Corrupted packet silently dropped by receiver!</span>'}</p>
  `;

  $('cs-result-val').textContent = hex16(checksum);
  $('cs-result-val').className   = 'cs-result-value fail';
  $('cs-result-status').textContent = '❌ Corruption detected — Datagram DROPPED by receiver!';
  $('cs-result-status').className   = 'cs-result-status fail';
  $('cs-result-box').className      = 'cs-result-box fail';

  drawVerifyCanvas(!isAllOnes);
}

function drawVerifyCanvas(detected) {
  if (!csVCtx) return;
  const ctx = csVCtx;
  const W = csVCanvas.width = csVCanvas.parentElement.clientWidth - 20;
  const H = csVCanvas.height = 130;
  ctx.clearRect(0, 0, W, H);

  const sx = 50, rx = W - 50, my = H / 2;
  drawNetNode(ctx, sx, my, '💻', '#58a6ff');
  drawNetNode(ctx, rx, my, detected ? '🚫' : '🖥️', detected ? '#f85149' : '#3fb950');

  ctx.strokeStyle = '#f85149'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(sx + 30, my); ctx.lineTo(rx - 30, my); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#f85149'; ctx.font = 'bold 13px "Segoe UI"'; ctx.textAlign = 'center';
  ctx.fillText('💥 Injected Bit Error Detected (Checksum Mismatch)', W / 2, my - 20);
  ctx.fillText(detected ? 'Datagram Dropped by Receiver' : 'Accepted', W / 2, my + 30);
}

function resetChecksum() {
  csSteps = []; csActiveStep = -1; csCorrupt = false;
  $('cs-steps-list').innerHTML = '<div class="cs-step-placeholder">Click "Step-by-Step Compute" to trace addition.</div>';
  $('cs-bit-table').innerHTML  = '<div class="cs-step-placeholder">Binary 16-bit registers will appear here.</div>';
  $('cs-step-pills').innerHTML = '';
  $('cs-result-val').textContent = '—';
  $('cs-result-val').className   = 'cs-result-value';
  $('cs-result-status').textContent = '';
  $('cs-result-status').className   = 'cs-result-status';
  $('cs-result-box').className      = 'cs-result-box';
  $('cs-verify-section').style.display = 'none';
  if (csCtx) { resizeCsCanvas(); csCtx.clearRect(0, 0, csCanvas.width, csCanvas.height); }
}

// ══════════════════════════════════════════════════════

//  MODULE 8: KNOWLEDGE LAB & QUIZ
// ══════════════════════════════════════════════════════
const QUIZ_QUESTIONS = [
  {
    q: "1. What is the fundamental purpose of the 16-bit UDP Checksum field?",
    options: [
      "To detect bit corruption across the header and payload (drops bad packets without repair).",
      "To automatically repair corrupted bits using forward error correction.",
      "To request immediate packet retransmission from the sender host.",
      "To encrypt the application data against eavesdropping."
    ],
    correct: 0,
    rationale: "The UDP checksum provides end-to-end error detection only. UDP does not support error correction, packet repair, or retransmission requests."
  },
  {
    q: "2. During receiver checksum verification over the pseudo-header, UDP header, and payload (including the checksum word), what value indicates a valid uncorrupted packet?",
    options: [
      "0x0000",
      "0xFFFF (all binary ones in one's complement addition)",
      "0x7F7F",
      "The value of the source port number"
    ],
    correct: 1,
    rationale: "When the receiver calculates the one's complement sum over all 16-bit words including the sender's inverted checksum, the result evaluates to 0xFFFF (all ones) if no corruption occurred."
  },
  {
    q: "3. What is the maximum theoretical UDP payload in a single, unfragmented IPv4 datagram with a standard 20-byte IP header?",
    options: [
      "1,500 bytes",
      "65,507 bytes (65,535 total IP length − 20B IP header − 8B UDP header)",
      "65,535 bytes",
      "576 bytes"
    ],
    correct: 1,
    rationale: "The 16-bit IPv4 Total Length field allows up to 65,535 bytes. Subtracting the 20-byte IP header and the 8-byte UDP header leaves exactly 65,507 bytes for the UDP payload."
  },
  {
    q: "4. How does the receiving operating system demultiplex incoming UDP datagrams to the correct application socket?",
    options: [
      "Using the 4-tuple: (Source IP, Destination IP, Source Port, Destination Port)",
      "Exclusively by matching the payload string",
      "Using only the MAC hardware address",
      "By requesting a TCP three-way handshake"
    ],
    correct: 0,
    rationale: "The transport layer uses the IP addresses and port numbers to look up the bound listening socket in the OS network socket table."
  },
  {
    q: "5. Why do competitive multiplayer games and live audio calls choose UDP over TCP?",
    options: [
      "UDP guarantees 100% packet arrival under all conditions.",
      "UDP provides zero connection-handshake latency and avoids head-of-line blocking from retransmitting outdated packets.",
      "TCP has smaller headers than UDP.",
      "UDP encrypts packets automatically."
    ],
    correct: 1,
    rationale: "Real-time interactive applications value timely delivery over perfection. In games and voice calls, a dropped packet is immediately superseded by fresh state; waiting for retransmissions causes unplayable lag."
  },
  {
    q: "6. If an application transmits a 3,000-byte UDP datagram over a path with a 1500-byte MTU, which protocol performs fragmentation?",
    options: [
      "UDP (Transport Layer)",
      "IPv4 / IPv6 (Network Layer)",
      "The application layer program",
      "DNS"
    ],
    correct: 1,
    rationale: "Fragmentation is strictly an IP Network Layer (Layer 3) responsibility. UDP does NOT segment or sequence its own datagrams."
  }
];

let quizScore = 0;
let answeredQuestions = new Set();

function initQuiz() {
  const container = $('quiz-questions-list');
  if (!container) return;
  container.innerHTML = '';
  quizScore = 0;
  answeredQuestions.clear();
  updateQuizScore();

  QUIZ_QUESTIONS.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'quiz-question-card';
    card.id = `quiz-q-${idx}`;

    const optsHtml = q.options.map((opt, optIdx) => `
      <button class="quiz-opt-btn" onclick="handleQuizAnswer(${idx}, ${optIdx})">${opt}</button>
    `).join('');

    card.innerHTML = `
      <div class="quiz-q-num">Question ${idx + 1} of ${QUIZ_QUESTIONS.length}</div>
      <div class="quiz-q-text">${q.q}</div>
      <div class="quiz-options">${optsHtml}</div>
      <div class="quiz-explanation" id="quiz-exp-${idx}"><strong>Explanation:</strong> ${q.rationale}</div>
    `;
    container.appendChild(card);
  });
}

function handleQuizAnswer(qIdx, optIdx) {
  if (answeredQuestions.has(qIdx)) return;
  answeredQuestions.add(qIdx);

  const q = QUIZ_QUESTIONS[qIdx];
  const card = $(`quiz-q-${qIdx}`);
  const buttons = card.querySelectorAll('.quiz-opt-btn');
  const exp = $(`quiz-exp-${qIdx}`);

  if (optIdx === q.correct) {
    buttons[optIdx].classList.add('correct');
    quizScore++;
  } else {
    buttons[optIdx].classList.add('wrong');
    buttons[q.correct].classList.add('correct');
  }

  if (exp) exp.classList.add('visible');
  updateQuizScore();
}

function updateQuizScore() {
  $('quiz-score-val').textContent = `${quizScore} / ${QUIZ_QUESTIONS.length}`;
  const pct = (quizScore / QUIZ_QUESTIONS.length) * 100;
  $('quiz-progress-fill').style.width = `${pct}%`;
}

// ══════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════
//  EVENT LISTENERS & NAVIGATION
// ══════════════════════════════════════════════════════

// Tab switching (5 Active Enterprise Tabs)
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const id = tab.dataset.tab;
    const target = $(`tab-${id}`);
    if (target) target.classList.add('active');

    if (id === 'sandbox') {
      setTimeout(() => {
        resizeNetCanvas();
        resizeTelemetryWave();
        resizeWorldMap();
      }, 60);
    }
    if (id === 'comparison') {
      setTimeout(() => {
        initComparisonCanvases();
        if (!State.comparisonRunning) startComparison();
      }, 60);
    }
    if (id === 'packet') {
      setTimeout(() => {
        resizePaNetCanvas();
        resizePktCanvas();
        startPaNetworkAnimation();
        buildAndVisualizePacket();
      }, 60);
    }
    if (id === 'checksum') {
      setTimeout(() => resizeCsCanvas(), 60);
    }
    if (id === 'quiz') {
      if (answeredQuestions.size === 0) initQuiz();
    }
  });
});

// Top bar quick scan / export action buttons
if ($('btn-top-scan')) {
  $('btn-top-scan').addEventListener('click', () => {
    burstSend();
    const ind = $('active-route-indicator');
    if (ind) ind.textContent = 'Active Scan Running: High-Volume UDP Burst...';
    setTimeout(updateRouteIndicator, 2000);
  });
}
if ($('btn-top-report')) {
  $('btn-top-report').addEventListener('click', () => {
    alert('NOC Telemetry Report generated successfully. Packets: ' + State.packetsSent + ' Sent, ' + State.packetsReceived + ' Delivered.');
  });
}

// Topology & Route controls
if ($('topology-select')) {
  $('topology-select').addEventListener('change', e => {
    State.selectedTopology = e.target.value;
    updateRouteIndicator();
  });
}
if ($('route-path-select')) {
  $('route-path-select').addEventListener('change', e => {
    State.selectedRoute = e.target.value;
    updateRouteIndicator();
  });
}
if ($('source-node-select')) {
  $('source-node-select').addEventListener('change', e => {
    State.selectedSource = e.target.value;
    if ($('sender-node-label')) $('sender-node-label').textContent = e.target.options[e.target.selectedIndex].text.split('(')[0];
    updateRouteIndicator();
  });
}
if ($('dest-node-select')) {
  $('dest-node-select').addEventListener('change', e => {
    State.selectedDest = e.target.value;
    if ($('recv-node-label')) $('recv-node-label').textContent = e.target.options[e.target.selectedIndex].text.split('(')[0];
    updateRouteIndicator();
  });
}

function updateRouteIndicator() {
  const t = State.selectedTopology;
  const r = State.selectedRoute;
  const ind = $('active-route-indicator');
  if (!ind) return;

  let txt = 'Route: ';
  if (t === 'direct') txt += 'Direct (1-Hop P2P)';
  else if (t === 'single-router') txt += `Client ➔ Router R1 (${r.toUpperCase()}) ➔ Server`;
  else if (t === 'dual-router') txt += `Client ➔ Core R1 ➔ Agg R2 (${r.toUpperCase()}) ➔ Server`;
  else txt += `Mesh: ${State.selectedSource.toUpperCase()} ➔ Routers ➔ ${State.selectedDest.toUpperCase()}`;

  ind.textContent = txt;
}

// Sandbox transmission buttons
if ($('btn-send')) $('btn-send').addEventListener('click', () => sendPacket());
if ($('btn-burst')) $('btn-burst').addEventListener('click', burstSend);
if ($('btn-reset')) $('btn-reset').addEventListener('click', resetSandbox);
if ($('btn-clear-timeline')) $('btn-clear-timeline').addEventListener('click', () => { if ($('timeline')) $('timeline').innerHTML = ''; });

if ($('loss-rate')) {
  $('loss-rate').addEventListener('input', e => {
    State.lossRate = parseInt(e.target.value);
    if ($('loss-rate-val')) $('loss-rate-val').textContent = `${State.lossRate}%`;
  });
}
if ($('jitter-amount')) {
  $('jitter-amount').addEventListener('input', e => {
    State.jitter = parseInt(e.target.value);
    if ($('jitter-val')) $('jitter-val').textContent = `${State.jitter} ms`;
    if ($('stat-jitter-dyn')) $('stat-jitter-dyn').textContent = `${State.jitter} ms`;
  });
}
if ($('bandwidth-limit')) {
  $('bandwidth-limit').addEventListener('change', e => {
    State.bandwidth = e.target.value;
  });
}
if ($('network-condition')) {
  $('network-condition').addEventListener('change', e => {
    State.networkCondition = e.target.value;
    const c = CONDITIONS[e.target.value];
    if ($('loss-rate')) { $('loss-rate').value = c.loss; State.lossRate = c.loss; }
    if ($('loss-rate-val')) $('loss-rate-val').textContent = `${c.loss}%`;
    if ($('jitter-amount')) { $('jitter-amount').value = c.jitter; State.jitter = c.jitter; }
    if ($('jitter-val')) $('jitter-val').textContent = `${c.jitter} ms`;
  });
}
if ($('anim-speed')) {
  $('anim-speed').addEventListener('input', e => {
    State.animSpeed = parseFloat(e.target.value);
    if ($('anim-speed-val')) $('anim-speed-val').textContent = `${State.animSpeed}x`;
  });
}

// Comparison Controls
if ($('btn-compare-start')) $('btn-compare-start').addEventListener('click', startComparison);
if ($('btn-compare-stop'))  $('btn-compare-stop').addEventListener('click', stopComparison);
if ($('cmp-loss')) {
  $('cmp-loss').addEventListener('input', e => {
    if ($('cmp-loss-val')) $('cmp-loss-val').textContent = `${e.target.value}%`;
  });
}
if ($('cmp-speed')) {
  $('cmp-speed').addEventListener('input', e => {
    cmpAnimSpeed = parseFloat(e.target.value);
    if ($('cmp-speed-val')) $('cmp-speed-val').textContent = `${cmpAnimSpeed}x`;
  });
}

// Packet Builder & Workstation Actions
if ($('btn-build-packet')) $('btn-build-packet').addEventListener('click', buildAndVisualizePacket);
if ($('btn-inject-error')) $('btn-inject-error').addEventListener('click', injectBitError);
if ($('btn-reset-packet')) $('btn-reset-packet').addEventListener('click', resetPacket);
if ($('btn-net-transit'))  $('btn-net-transit').addEventListener('click', () => triggerNetworkTransitAnim(bitErrorIdx >= 0));

if ($('btn-send-built')) {
  $('btn-send-built').addEventListener('click', () => {
    if (!builtPacket) { buildAndVisualizePacket().then(() => doSendBuilt()); return; }
    doSendBuilt();
  });
}

function doSendBuilt() {
  triggerNetworkTransitAnim(bitErrorIdx >= 0);
  pbLogEvent('send', `Dispatched to sandbox simulation: ${builtPacket.srcIP}:${builtPacket.srcPort} ➔ ${builtPacket.dstIP}:${builtPacket.dstPort}`,
    `Payload: "${builtPacket.payload.slice(0, 35)}" | Size: ${builtPacket.length + 20}B`);
  setTimeout(() => {
    const sboxTab = document.querySelector('[data-tab="sandbox"]');
    if (sboxTab) sboxTab.click();
    setTimeout(() => {
      if ($('msg-input')) $('msg-input').value = builtPacket.payload;
      sendPacket({ message: builtPacket.payload });
    }, 200);
  }, 900);
}

// 5-Stage Tracker Controls
if ($('btn-stage-prev'))   $('btn-stage-prev').addEventListener('click', () => setPaStage(paStage - 1));
if ($('btn-stage-next'))   $('btn-stage-next').addEventListener('click', () => setPaStage(paStage + 1));
if ($('btn-stage-play'))   $('btn-stage-play').addEventListener('click', playPaStages);
if ($('btn-stage-replay')) $('btn-stage-replay').addEventListener('click', replayPaStages);

document.querySelectorAll('.pa-stage-pill').forEach(pill => {
  pill.addEventListener('click', () => setPaStage(parseInt(pill.dataset.stage)));
});

// Inspector Tabs
document.querySelectorAll('.pa-insp-tab').forEach(tab => {
  tab.addEventListener('click', () => pbSwitchInspectorTab(tab.dataset.tab));
});

// Presets
if ($('src-port-preset')) {
  $('src-port-preset').addEventListener('change', e => {
    if (e.target.value) { $('src-port').value = e.target.value; e.target.value = ''; if (builtPacket) buildAndVisualizePacket(); }
  });
}
if ($('dst-port-preset')) {
  $('dst-port-preset').addEventListener('change', e => {
    if (e.target.value) { $('dst-port').value = e.target.value; e.target.value = ''; if (builtPacket) buildAndVisualizePacket(); }
  });
}

document.querySelectorAll('.pb-type-btn').forEach(btn => {
  btn.addEventListener('click', () => pbSetPayloadType(btn.dataset.type));
});

const payloadTA = $('payload-data');
if (payloadTA) {
  payloadTA.addEventListener('input', () => {
    pbUpdatePayloadMeta();
    if (builtPacket) buildAndVisualizePacket();
  });
}

['src-ip', 'dst-ip', 'src-port', 'dst-port', 'ttl'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', () => { if (builtPacket) buildAndVisualizePacket(); });
});

document.querySelectorAll('.pb-mini-tab').forEach(tab => {
  tab.addEventListener('click', () => pbSwitchMiniTab(tab.dataset.pbtab));
});

document.querySelectorAll('.pb-filter-btn[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pb-filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pbFilterLog(btn.dataset.filter);
  });
});

if ($('pb-log-clear')) {
  $('pb-log-clear').addEventListener('click', () => {
    pbLogData.length = 0;
    if ($('pb-log-entries')) $('pb-log-entries').innerHTML = '<div class="pb-log-empty">Event log cleared.</div>';
    if ($('pb-log-count')) $('pb-log-count').textContent = '0 events';
  });
}

// Checksum tab
if ($('cs-btn-compute')) $('cs-btn-compute').addEventListener('click', runChecksumCompute);
if ($('cs-btn-corrupt')) $('cs-btn-corrupt').addEventListener('click', runCorruptVerify);
if ($('cs-btn-reset'))   $('cs-btn-reset').addEventListener('click', resetChecksum);
if ($('cs-speed')) {
  $('cs-speed').addEventListener('input', e => {
    csSpeed = parseFloat(e.target.value);
    if ($('cs-speed-val')) $('cs-speed-val').textContent = `${csSpeed}x`;
  });
}

// Quiz tab
if ($('btn-quiz-reset')) $('btn-quiz-reset').addEventListener('click', initQuiz);

// ── App Initialization ────────────────────────────────
let appInitialized = false;
function initApp() {
  if (appInitialized) return;
  appInitialized = true;

  resizeNetCanvas();
  resizeTelemetryWave();
  resizeWorldMap();
  requestAnimationFrame(animLoop);
  updateStats();
  if ($('sender-port')) $('sender-port').textContent = randInt(49152, 65535);
  pbUpdatePayloadMeta();
  buildAndVisualizePacket();
  resizePaNetCanvas();
  startPaNetworkAnimation();
  pbLogEvent('info', 'Enterprise UDP-Scope Suite loaded and initialized successfully.');
  initComparisonCanvases();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
  window.addEventListener('load', initApp);
} else {
  initApp();
}

window.addEventListener('resize', () => {
  resizeNetCanvas();
  resizeTelemetryWave();
  resizeWorldMap();
  if (document.querySelector('#tab-comparison.active')) initComparisonCanvases();
  if (document.querySelector('#tab-checksum.active'))   resizeCsCanvas();
  if (document.querySelector('#tab-packet.active'))     { resizePaNetCanvas(); resizePktCanvas(); }
});
