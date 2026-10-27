# 📡 UDP Protocol Sandbox

An interactive, animated educational sandbox for understanding the **User Datagram Protocol (UDP)**.

## 🚀 How to Open

Just double-click `index.html` — no build tools, no dependencies, pure HTML/CSS/JS.

## 🗂️ Project Structure

```
udp-sandbox/
├── index.html       ← Main entry point
└── src/
    ├── style.css    ← Dark-theme UI styles & animations
    └── app.js       ← Full simulation engine + Canvas animations
```

## 🧪 Features

### Tab 1 — Sandbox
- **Live packet animation** on an animated network canvas
- **Configurable loss rate** (0–100%) with real-time slider
- **Network condition presets**: Perfect / Lossy / Congested / Chaotic
- **Burst send** — fire multiple packets simultaneously
- **Jitter & reordering** simulation
- **Real-time stats**: packets sent/received/lost, throughput, latency
- **Packet timeline** with tooltips showing per-packet fate

### Tab 2 — Concepts
8 animated concept cards, each with a dedicated Canvas animation:
| Concept | What You See |
|---|---|
| What is UDP? | OSI layer diagram with animated data flow |
| Datagrams | Rotating field highlight of UDP header structure |
| No Handshake | Side-by-side TCP 3-way vs UDP direct send |
| Packet Loss | Packets flying, some exploding mid-air |
| No Ordering | Packets sent 1234, arriving 1324 |
| Checksum | Animated field-by-field checksum calculation |
| Multicast | One sender → five receivers simultaneously |
| Use Cases | Bouncing use-case cards (Gaming, DNS, VoIP…) |

### Tab 3 — UDP vs TCP
- **Side-by-side lane** animation of both protocols
- Configurable network loss slider
- UDP: fast, no ACKs, some lost
- TCP: slower, ACK packets visible, retransmission simulation

### Tab 4 — Packet Builder
- Build a full UDP datagram field-by-field (IP + UDP header + payload)
- Live **hex dump** view
- Decoded fields panel
- **Inject bit error** — corrupts payload, shows checksum mismatch
- **Send this packet** — jumps to Sandbox and sends it!

## 📚 UDP Quick Reference

| Property | UDP | TCP |
|---|---|---|
| Connection | Connectionless | Connection-oriented |
| Reliability | ❌ No | ✅ Yes |
| Ordering | ❌ No | ✅ Yes |
| Header size | **8 bytes** | 20+ bytes |
| Latency | ⚡ Very low | Higher |
| Use case | Gaming, DNS, VoIP | HTTP, File transfer |
