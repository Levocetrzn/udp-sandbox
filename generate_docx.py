import os
import zipfile
from xml.sax.saxutils import escape

def build_docx(filename):
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"""

    root_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

    doc_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

    styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="23"/>
        <w:szCs w:val="23"/>
        <w:color w:val="1F2937"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="160" w:line="288" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>

  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr>
      <w:spacing w:before="240" w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/>
      <w:b/>
      <w:sz w:val="56"/>
      <w:color w:val="1F497D"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:pPr>
      <w:spacing w:after="360"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:i/>
      <w:sz w:val="26"/>
      <w:color w:val="4B5563"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr>
      <w:spacing w:before="360" w:after="140"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/>
      <w:b/>
      <w:sz w:val="36"/>
      <w:color w:val="1F497D"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr>
      <w:spacing w:before="260" w:after="100"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/>
      <w:sz w:val="28"/>
      <w:color w:val="2563EB"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr>
      <w:spacing w:before="180" w:after="60"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="24"/>
      <w:color w:val="111827"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/>
    <w:pPr>
      <w:spacing w:after="80"/>
      <w:ind w:left="400"/>
    </w:pPr>
    <w:rPr>
      <w:sz w:val="22"/>
    </w:rPr>
  </w:style>

  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      </w:tblBorders>
    </w:tblPr>
  </w:style>
</w:styles>"""

    body_elements = []

    def p(text, style=None, bold=False, italic=False, color=None, space_after=140):
        t = escape(str(text))
        style_xml = f'<w:pStyle w:val="{style}"/>' if style else ''
        sp_xml = f'<w:spacing w:after="{space_after}"/>' if space_after else ''
        pPr = f'<w:pPr>{style_xml}{sp_xml}</w:pPr>' if (style_xml or sp_xml) else ''
        rPr_parts = []
        if bold: rPr_parts.append('<w:b/>')
        if italic: rPr_parts.append('<w:i/>')
        if color: rPr_parts.append(f'<w:color w:val="{color}"/>')
        rPr = f'<w:rPr>{"".join(rPr_parts)}</w:rPr>' if rPr_parts else ''
        return f'<w:p>{pPr}<w:r>{rPr}<w:t xml:space="preserve">{t}</w:t></w:r></w:p>'

    def bullet(bold_prefix, text):
        bp = escape(str(bold_prefix))
        txt = escape(str(text))
        return f"""<w:p>
          <w:pPr>
            <w:pStyle w:val="ListBullet"/>
            <w:spacing w:after="80"/>
            <w:ind w:left="480" w:hanging="240"/>
          </w:pPr>
          <w:r><w:rPr><w:b/><w:color w:val="1F497D"/></w:rPr><w:t xml:space="preserve">&#x25AA; </w:t></w:r>
          <w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{bp}: </w:t></w:r>
          <w:r><w:t xml:space="preserve">{txt}</w:t></w:r>
        </w:p>"""

    def callout(title, text):
        t_title = escape(str(title))
        t_text = escape(str(text))
        return f"""<w:tbl>
          <w:tblPr>
            <w:tblW w:w="9360" w:type="dxa"/>
            <w:tblBorders>
              <w:top w:val="none"/>
              <w:left w:val="single" w:sz="24" w:space="0" w:color="1F497D"/>
              <w:bottom w:val="none"/>
              <w:right w:val="none"/>
            </w:tblBorders>
            <w:tblCellMar>
              <w:top w:w="120" w:type="dxa"/>
              <w:left w:w="200" w:type="dxa"/>
              <w:bottom w:w="120" w:type="dxa"/>
              <w:right w:w="200" w:type="dxa"/>
            </w:tblCellMar>
          </w:tblPr>
          <w:tr>
            <w:tc>
              <w:tcPr>
                <w:tcW w:w="9360" w:type="dxa"/>
                <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
              </w:tcPr>
              <w:p>
                <w:pPr><w:spacing w:after="60"/></w:pPr>
                <w:r><w:rPr><w:b/><w:color w:val="1F497D"/><w:sz w:val="23"/></w:rPr><w:t>{t_title}</w:t></w:r>
              </w:p>
              <w:p>
                <w:pPr><w:spacing w:after="0"/></w:pPr>
                <w:r><w:rPr><w:color w:val="334155"/><w:sz w:val="21"/></w:rPr><w:t>{t_text}</w:t></w:r>
              </w:p>
            </w:tc>
          </w:tr>
        </w:tbl>
        <w:p><w:pPr><w:spacing w:after="160"/></w:pPr></w:p>"""

    def table(headers, rows, col_widths):
        hdr_xml = '<w:tr><w:trPr><w:tblHeader/></w:trPr>'
        for i, h in enumerate(headers):
            w = col_widths[i]
            hdr_xml += f"""<w:tc>
              <w:tcPr>
                <w:tcW w:w="{w}" w:type="dxa"/>
                <w:shd w:val="clear" w:color="auto" w:fill="1F497D"/>
              </w:tcPr>
              <w:p>
                <w:pPr><w:spacing w:before="80" w:after="80"/><w:jc w:val="left"/></w:pPr>
                <w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="21"/></w:rPr><w:t>{escape(h)}</w:t></w:r>
              </w:p>
            </w:tc>"""
        hdr_xml += '</w:tr>'

        rows_xml = []
        for r_idx, row in enumerate(rows):
            fill = 'F8FAFC' if r_idx % 2 == 1 else 'FFFFFF'
            row_xml = f'<w:tr>'
            for i, cell in enumerate(row):
                w = col_widths[i]
                row_xml += f"""<w:tc>
                  <w:tcPr>
                    <w:tcW w:w="{w}" w:type="dxa"/>
                    <w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>
                  </w:tcPr>
                  <w:p>
                    <w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>
                    <w:r><w:rPr><w:sz w:val="20"/><w:color w:val="1E293B"/></w:rPr><w:t>{escape(str(cell))}</w:t></w:r>
                  </w:p>
                </w:tc>"""
            row_xml += '</w:tr>'
            rows_xml.append(row_xml)

        total_w = sum(col_widths)
        return f"""<w:tbl>
          <w:tblPr>
            <w:tblStyle w:val="TableGrid"/>
            <w:tblW w:w="{total_w}" w:type="dxa"/>
            <w:tblCellMar>
              <w:top w:w="80" w:type="dxa"/>
              <w:left w:w="120" w:type="dxa"/>
              <w:bottom w:w="80" w:type="dxa"/>
              <w:right w:w="120" w:type="dxa"/>
            </w:tblCellMar>
          </w:tblPr>
          {hdr_xml}
          {"".join(rows_xml)}
        </w:tbl>
        <w:p><w:pPr><w:spacing w:after="200"/></w:pPr></w:p>"""

    # Title & Subtitle
    body_elements.append(p("UDP-Scope", style="Title"))
    body_elements.append(p("An Interactive Network Protocol Simulation, Visualization and Performance Analysis Platform", style="Subtitle"))
    body_elements.append(p("Project Enhancement & Architectural Specification  |  Version 3.0  |  Pure HTML5 / ES6 / Canvas 2D  |  Zero External Dependencies", italic=True, color="64748B", space_after=240))

    body_elements.append(callout(
        "Executive Summary",
        "UDP-Scope is an upgraded educational and experimental networking suite extending the original UDP Protocol Sandbox into an interactive protocol analysis workbench. It unites network topology simulation, Wireshark-inspired multi-layer packet inspection, synchronized TCP vs UDP benchmark experiments, an IPv4 MTU fragmentation and reassembly demonstrator, RFC 768 / 1071 checksum verification, a performance analytics dashboard with rule-based traffic anomaly detection, and an interactive self-assessment laboratory."
    ))

    # SECTION 1
    body_elements.append(p("1. Complete Project Module Suite", style="Heading1"))
    body_elements.append(p("UDP-Scope organizes protocol investigation into eight interconnected modules:"))

    # Module 1
    body_elements.append(p("Module 1: Interactive Network Topology & Simulation Sandbox", style="Heading2"))
    body_elements.append(bullet("Configurable Network Topologies", "Supports Point-to-Point (direct 1-hop), Single Edge Router (Client ➔ R1 ➔ Server), Dual-Router Transit (Core R1 ➔ Aggregation R2), and Multi-Node Mesh (Senders A/B, Routers R1/R2, Receivers A/B)."))
    body_elements.append(bullet("Path Selection & Queue Modeling", "Switch between Primary (fast link), Secondary (satellite delay), and Congested Bottleneck routes with live router buffer queue meters."))
    body_elements.append(bullet("Four-State Packet Lifecycle", "Canvas 2D particle engine renders packet transitions through QUEUED (buffer waiting), TRANSMITTED (link traversal), DROPPED (red fragmentation explosion), and DELIVERED (green arrival flash)."))
    body_elements.append(bullet("Full Impairment Controls", "Interactive sliders for packet loss (0-100%), transmission delay (0-2000ms), jitter variance (0-150ms), and bandwidth throttling."))

    # Module 2
    body_elements.append(p("Module 2: Visual Concept Explanations", style="Heading2"))
    body_elements.append(bullet("Foundational Networking Slideshow", "8 synchronized canvas animations explaining: What is UDP, 8-Byte Datagram Structure, Zero-Handshake Transmission, Unbuffered Packet Loss, Independent Routing & Out-of-Order Arrival, Checksum Verification, Subnet Broadcast/Multicast, and Real-World Applications."))

    # Module 3
    body_elements.append(p("Module 3: Controlled TCP vs UDP Comparative Simulator", style="Heading2"))
    body_elements.append(bullet("Dual-Lane Synchronized Race", "Upper lane visualizes UDP (fire-and-forget, zero handshake), while lower lane simulates TCP (3-way handshake SYN/SYN-ACK/ACK, sequence tracking, reverse flowing ACKs, and timeout retransmissions)."))
    body_elements.append(bullet("Side-by-Side Comparison Matrix", "10-point technical matrix comparing Connection Model, Reliability, Ordering, Flow Control, Congestion Control, Header Overhead, Latency, and Broadcast Support."))

    # Module 4
    body_elements.append(p("Module 4: Wireshark-Style Packet Inspector & Datagram Builder", style="Heading2"))
    body_elements.append(bullet("Collapsible Layer Cards", "Modular configuration for IPv4 Header (20B), UDP Header (8B), and Payload with preset generators for Text, DNS, NTP, and Gaming packets."))
    body_elements.append(bullet("Wireshark-Inspired Protocol Dissector", "Collapsible multi-layer tree displaying Frame, Ethernet II, IPv4, UDP, and Payload fields."))
    body_elements.append(bullet("5-Phase Assembly Animation", "Bottom-up canvas animation: Bit Matrix Stream ➔ Payload Block ➔ UDP 8B Header ➔ IPv4 20B Wrapper ➔ Ready-to-Send state."))
    body_elements.append(bullet("RFC 768 32-Bit Datagram & Hex Dump", "Bit-level diagram with byte offsets and memory hex dump with ASCII sidebar."))
    body_elements.append(bullet("Bit-Error Injection", "Single-click bit flip demonstrating checksum mismatch and packet drop."))

    # Module 5
    body_elements.append(p("Module 5: IP Fragmentation & Destination Reassembly Engine", style="Heading2"))
    body_elements.append(bullet("IPv4 MTU Slicing", "Demonstrates how an IPv4 datagram exceeding path MTU (1500, 576, 256, 128 bytes) is divided into 8-byte aligned slices with More Fragments (MF) flag and Fragment Offsets."))
    body_elements.append(bullet("Destination Reassembly & Loss Demonstration", "'Drop Single Fragment' test illustrates why losing even 1 fragment forces the destination IPv4 layer to drop the entire UDP datagram."))
    body_elements.append(bullet("Layer Distinction Callout", "Explicitly teaches that fragmentation is an IPv4 Network Layer function; UDP does NOT segment or sequence datagrams."))

    # Module 6
    body_elements.append(p("Module 6: RFC 768 / RFC 1071 16-Bit Checksum Engine", style="Heading2"))
    body_elements.append(bullet("12-Byte IPv4 Pseudo-Header", "Includes Source IP, Destination IP, Protocol (17), and UDP Length as mandated by RFC 768."))
    body_elements.append(bullet("One's Complement Arithmetic", "Step-by-step 16-bit word addition with end-around carry and bitwise inversion (~sum)."))
    body_elements.append(bullet("Receiver Verification", "Demonstrates why a valid datagram calculates to 0xFFFF at the receiver."))

    # Module 7
    body_elements.append(p("Module 7: Network Performance Dashboard & Anomaly Analysis", style="Heading2"))
    body_elements.append(bullet("Real-Time Throughput Graph", "Canvas 2D scrolling plot of bandwidth (KB/s) over time."))
    body_elements.append(bullet("Live KPIs", "Packet Delivery Ratio (PDR %), Loss Rate %, Average Latency (ms), and Jitter variance."))
    body_elements.append(bullet("Application Scenario Profiles", "One-click benchmarks for DNS Queries, Multiplayer Gaming, VoIP Audio, Live Video Streams, and IoT Telemetry."))
    body_elements.append(bullet("Transparent Rule-Based Anomaly Detection", "Heuristic engine flagging packet rate burst spikes (>40 pkts/s), jumbo payloads (>1400B), and port scanning."))

    # Module 8
    body_elements.append(p("Module 8: Knowledge Lab & Interactive Assessment Mode", style="Heading2"))
    body_elements.append(bullet("Interactive Knowledge Checks", "6 multiple-choice questions testing checksum verification (0xFFFF), maximum unfragmented IPv4 payload (65,507B), port multiplexing, TCP/UDP trade-offs, and IP layer fragmentation."))
    body_elements.append(bullet("Immediate Feedback", "Instant scoring, animated progress bar, and comprehensive technical rationales."))

    # SECTION 2
    body_elements.append(p("2. Technical Specifications & Accuracy Standards", style="Heading1"))
    body_elements.append(bullet("UDP Maximum Payload", "For an unfragmented IPv4 datagram with standard 20B header, the maximum UDP payload is 65,507 bytes (65,535 total IP length − 20 IP header − 8 UDP header)."))
    body_elements.append(bullet("Checksum Scope", "UDP checksum detects data corruption; it does not repair corrupted packets or request retransmission."))
    body_elements.append(bullet("Simulation Environment", "Runs 100% in modern browsers via standard ES6 and HTML5 Canvas 2D without requiring administrative socket privileges."))

    # TABLE
    body_elements.append(p("3. System Component Architecture", style="Heading1"))
    headers = ["Layer / Component", "Module", "Primary Responsibilities", "Implementation Technology"]
    widths = [2000, 2000, 3360, 2000]
    rows = [
        ["User Interface", "All Tabs", "Responsive dark theme UI, controls, tabs, Wireshark tree", "HTML5, CSS3 Grid/Flexbox"],
        ["Simulation Engine", "Sandbox & Topo", "Packet lifecycle, topology routing, queue buffers, delay/loss", "Canvas 2D, requestAnimationFrame"],
        ["Protocol Dissector", "Packet Inspector", "Wireshark tree parsing, 32-bit datagram diagram, hex dump", "ArrayBuffer, Bitwise Ops, DOM"],
        ["Fragmentation Model", "IP Fragmentation", "MTU slicing, Fragment Offset, MF flag, destination buffer", "RFC 791 IPv4 math, Canvas 2D"],
        ["Mathematical Engine", "Checksum Tab", "RFC 768 pseudo-header, 16-bit word addition, 0xFFFF check", "16-bit one's complement, Bit table"],
        ["Analysis Engine", "Performance Tab", "Throughput chart, PDR %, latency/jitter KPIs, anomaly rules", "Canvas 2D plot, rule engine"],
        ["Assessment Layer", "Knowledge Lab", "Interactive quiz, real-time score tracking, explanations", "DOM event handlers, score state"]
    ]
    body_elements.append(table(headers, rows, widths))

    # Assemble document
    doc_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {"".join(body_elements)}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>"""

    with zipfile.ZipFile(filename, 'w', compression=zipfile.ZIP_DEFLATED) as docx:
        docx.writestr('[Content_Types].xml', content_types)
        docx.writestr('_rels/.rels', root_rels)
        docx.writestr('word/_rels/document.xml.rels', doc_rels)
        docx.writestr('word/styles.xml', styles_xml)
        docx.writestr('word/document.xml', doc_xml)

    print(f"Document successfully created at: {filename}")

if __name__ == '__main__':
    target = r'C:\Users\anivy\.gemini\antigravity\scratch\udp-sandbox\UDP_Protocol_Sandbox_Features.docx'
    build_docx(target)
