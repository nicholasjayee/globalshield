# SentinelShield — Personal Browser Protection

SentinelShield is an experimental Manifest V3 Chrome extension combining hand-maintained network rules, page-level privacy and navigation hooks, cosmetic filtering, and informational DNS response comparisons. It is not a phishing/malware reputation service or a replacement for browser Safe Browsing.

---

## 🛡️ Architecture & Module Map

```
sentinel-shield/
├── manifest.json                     # Strict MV3 specification with privacy permissions, rulesets, and main-world scripts
├── README.md                         # Complete architectural & defense documentation
├── icons/                            # High-resolution extension icons (16, 32, 48, 128px)
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
│
├── rules/                            # DeclarativeNetRequest network filtering
│   ├── rules-global.json             # Static tracker blocks, HTTPS upgrades, selected direct private-address blocks, privacy headers
│   └── rules-streaming.json          # Streaming-specific ad hosts (pufted, hisavana, etc.)
│
├── background/                       # Service Worker (ES6 modules)
│   ├── index.js                      # Service Worker lifecycle entrypoint & tab navigation watcher
│   ├── dns-security.js               # Informational A/AAAA comparisons across public DoH resolvers
│   ├── dns-utils.js                  # DNS response classification and non-public IP checks
│   ├── protection-manager.js         # DNR toggles and browser-level permission policies
│   ├── privacy-manager.js            # Browser-level WebRTC IP handling policy & hyperlink auditing
│   ├── state-manager.js              # Tab session tracking & debounced chrome.storage persistence (with DNS & hijack counts)
│   ├── badge-manager.js              # Action badge counts, colors (#e5484d), and reset handling
│   ├── message-router.js             # Runtime message dispatcher for stats and DNS security queries
│   └── dnr-listener.js               # Debug-only DNR match telemetry
│
├── content/                          # Isolated World Content Script
│   ├── index.js                      # Content script bootstrap
│   ├── stats-reporter.js             # Batches interception counts and communicates with background
│   ├── observer.js                   # Toggleable subtree observer and bounded late-ad watchdog
│   ├── settings-bridge.js            # Per-site settings sync between isolated and page worlds
│   ├── overlays/
│   │   └── overlay-detector.js       # Heuristic detector for transparent & near-invisible click layers
│   └── cosmetic/
│       ├── generic-selectors.js      # Global ad, banner, floating video, and anti-adblock modal selectors
│       ├── iframe-filter.js          # Suspicious & ad-network iframe host detector
│       ├── cosmetic-cleaner.js       # Core DOM traversal & batched element removal engine
│       ├── element-tracker.js        # [NEW] Dedicated classifier & metrics logger for DOM ad element removals (ad_elements)
│       └── site-rules/
│           └── moviebox.js           # MovieBox / mzfi.me ad-container cleanup
│
├── main-world/                       # Page Context Hooks (world: "MAIN", run_at: "document_start")
│   ├── index.js                      # Main-world bootstrap and guard orchestrator
│   ├── config.js                     # Domain matchers, protection flags, and direct private-address checks
│   ├── device-guard.js               # Best-effort Web Bluetooth/USB/HID/Serial page API guard
│   ├── bridge/
│   │   └── event-bridge.js           # Safe custom-event bridge to isolated content script
│   ├── privacy/
│   │   ├── webrtc-shield.js          # WebRTC IP privacy protection, gated by anti-fingerprinting
│   │   ├── fingerprint-shield.js     # [UPGRADED] Canvas/OffscreenCanvas, WebGL readPixels, AudioContext, hardware entropy
│   
│   │   ├── domrect-shield.js         # [NEW] Micro-jitter on getBoundingClientRect and getBBox against font engine geometry profiling
│   │   ├── font-shield.js            # [NEW] Restricts document.fonts.check to standard universal web-safe fonts
│   │   └── anti-adblock-defuser.js   # [NEW] Inert stubs for adsbygoogle, ga, and canRunAds to neutralize blocker detectors
│   ├── navigation/
│   │   ├── popup-guard.js            # Filters unsafe pop-up URLs and clears opener relationships
│   │   ├── redirect-guard.js         # Best-effort redirect interception for blocked hosts
│   │   ├── history-guard.js          # High-threshold History API flood heuristic
│   │   ├── permission-guard.js       # Notification prompt guard on selected streaming sites
│   │   └── service-worker-guard.js   # Blocks selected host and direct private-address registrations
│   ├── network/
│   │   ├── fetch-guard.js            # Blocks selected ad hosts and direct private-address requests
│   │   ├── xhr-guard.js              # Blocks selected ad hosts and direct private-address requests
│   │   ├── websocket-guard.js        # Intercepts selected ad hosts and private-address connections
│   │   ├── request-tracker.js        # [NEW] Dedicated classifier & metrics logger for blocked ad network requests (ad_requests)
│   │   └── beacon-guard.js           # Blocks background navigator.sendBeacon tracking telemetry
│   ├── dom/
│   │   ├── element-guard.js          # [UPGRADED] Traps script/iframe injection, base-href hijacking, form rewriting & noopener
│   │   ├── click-guard.js            # Heuristic capture-phase click handling on suspicious overlays
│   │   ├── clipboard-guard.js        # [UPGRADED] Crypto-clipper address swap defense and shell payload injection defense
│   │   └── keystroke-guard.js        # Keyboard event timestamp jitter for behavioral fingerprinting
│   └── streaming/
│       ├── video-guard.js            # Suppresses the MovieBox timeupdate listener used by trial-state logic
│       └── fallback-player.js        # Video recovery behavior on target streaming sites
└── popup/                            # Extension Popup Interface
    ├── popup.html                    # Minimalist, card-free flat UI with live DNS security pill and separate metrics
    ├── popup.css                     # Sleek dark theme without bloated cards, boxes, or borders
    ├── popup.js                      # Popup controller with real-time stats and DNS status polling
    └── popup-renderer.js             # UI rendering engine with distinct ad_requests vs ad_elements and DNS status
```

---

## 🛡️ Core Defense Dimensions

### 1. Anti-Fingerprinting (Invasive; Toggle Per Site)
- When enabled, the page-world shield perturbs canvas, WebGL, and audio readback, masks selected hardware fields, limits some device/voice enumeration, and filters WebRTC ICE candidates outside common conferencing sites.
- These API modifications are not browser-level guarantees. They can interfere with image processing, graphics, audio, and feature detection. Disable them for a site if those features misbehave.
- Timezone spoofing is intentionally not initialized: the previous implementation could make `Date` and `Intl` results inconsistent with real browser behavior.
- Disguising patched methods as native is not a security boundary and does not reliably defeat anti-tampering checks.

---

### 2. Comprehensive Hijacking & Trap Protection
- **Reverse Tabnabbing & Opener Protection**: Enforces `newWin.opener = null` on all `window.open()` calls and automatically ensures `rel="noopener noreferrer"` on `<a target="_blank">` elements, preventing newly opened tabs from navigating the originating tab.
- **Crypto-Clipper & Clipboard Defense**: Intercepts `copy` and `cut` events at capture phase; detects and neutralizes stealth replacement of copied text with attacker cryptocurrency addresses (Bitcoin, Ethereum, Solana, Litecoin) or malicious PowerShell/bash shell payloads.
- **History Trapping & Back-Button Defense**: Applies a high threshold to rapid History API calls. Blanket suppression of `beforeunload` listeners was removed because it could break legitimate applications.
- **Form Action Hijacking**: Prevents third-party scripts from rewriting `<form action="...">` to unauthorized ad hosts or cross-origin phishing endpoints.
- **Service Worker Hijacking**: Blocks registration from known blocked hosts or direct local/private-address URLs; it does not detect hostname-based DNS rebinding.
- **Deceptive Click Layers & Overlays**: Neutralizes astronomical z-index fixed overlays and transparent click interception layers.

---

### 3. Modern Ad Protection & Ad Element vs. Request Separation
- **Accurate Observation Pipeline (Request vs Element Separation)**:
  - Previously, network-level ad requests and DOM-level ad elements were combined into a generic "ads" counter, muddying telemetry.
  - **`main-world/network/request-tracker.js` (Dedicated Ad Requests)**: Intercepts network calls (Fetch, XHR, Beacon, WebSocket), evaluates target endpoints against classified advertising/tracking hosts and URL patterns, maintains in-memory tab session logs, and broadcasts `ad_requests` events to the isolated world bridge.
  - **`content/cosmetic/element-tracker.js` (Dedicated Ad Elements)**: Runs in the isolated content script world, observing and classifying DOM nodes stripped by the cosmetic cleaner (e.g. ad banners, floating video units, sponsor wrappers, anti-adblock modals, ad-network iframes). It tracks element selectors, dimensions, and timestamps, dispatching dedicated `ad_elements` reports.
- **WebSocket Ad Guard**: Intercepts `window.WebSocket` to block ad network bypasses and tracking connections that evade HTTP network filters.
- **Anti-Adblock Defusers**: Provides safe, inert stubs for `window.adsbygoogle`, `window.ga`, `window.fbq`, and `window.canRunAds`, preventing anti-adblock paywalls and detection scripts from locking out the user.
- **Network Filtering (DNR)**: Declarative Net Request rules block tracking, telemetry, and advertising servers before requests touch the network.
- **Cosmetic Filtering & Watchdog**: Watches added DOM subtrees and applies selectors, with a bounded 20-second watchdog. Disable cleanup globally or per site to diagnose removed page elements; reload to restore elements already removed.

### Personal Controls and Defaults
- Network rules, streaming rules, cosmetic cleanup, page guards, and anti-fingerprinting are enabled by default.
- Camera, microphone, location, notifications, and advanced clipboard access are blocked through Chrome content settings by default. These browser-level rules can override existing site grants when Chrome gives SentinelShield control of the setting. After updating an unpacked build that adds the `contentSettings` permission, reload the extension in `chrome://extensions` and accept any permission prompt.
- Per-site exceptions can allow camera, microphone, location, notifications, or advanced clipboard while the global block remains on. Turning an exception off returns that site to the global block.
- Session-only cookies are optional and off by default; Chrome treats cookies created while enabled as session cookies. Sites may sign you out.
- Per-site controls can disable cosmetic cleanup, page guards (including anti-adblock stubs), or anti-fingerprinting (including WebRTC filtering) for a known-good site. Page-world feature controls are best-effort; a hostile page can tamper with JavaScript APIs, so rely on Chrome content settings for device permission enforcement.
- Streaming ad filters remain separate from player event handling. On streaming targets, the page guard suppresses registration of the `timeupdate` video listener used by MovieBox trial-state logic; the per-site page-guards switch controls this behavior.
- Chrome does not expose equivalent global extension controls for Bluetooth, USB, HID, or Serial grants. Their page API guard is best-effort, cannot revoke a device already opened by a page, and may be bypassed by page code. Use the Chrome Bluetooth settings shortcut to review persistent grants.
- Cosmetic and page-world changes apply live where possible. Reload for a clean comparison and to restore any DOM already removed.

---

### 4. Informational DNS Response Checks and Direct Private-Address Blocks
- When opened, the popup compares A and AAAA responses from Cloudflare, Google, and AdGuard DoH endpoints. Only then is the current page's hostname sent to those providers; this shares that browsing domain with them.
- The check distinguishes incomplete responses, NXDOMAIN/answer disagreement, differing public IP sets, and non-public IP answers. Different public IP sets can be normal for CDNs or geographic DNS and are not by themselves evidence of an attack.
- The DNS comparison is informational and runs after tab navigation begins. It does not block navigation, query a phishing/malware reputation feed, validate the browser's actual DNS answer, or detect BGP hijacking.
- `FetchGuard`, `XhrGuard`, `WebSocketGuard`, popup, and service-worker hooks block direct requests whose URL itself names a local/private address. Page JavaScript cannot determine whether a public hostname later resolves to a private address, so these hooks do not prevent hostname-based DNS rebinding.
- Static Declarative Net Request rules block selected direct requests to loopback and cloud metadata endpoints. These are targeted rules, not comprehensive LAN-access protection.
- DNR HTTPS-upgrade rules can upgrade eligible HTTP requests, but this does not prevent DNS or BGP attacks and does not replace HTTPS certificate validation.

---

## ⚠️ Operational Boundaries & Threat Model

1. **No reputation feed**: The extension does not include a maintained phishing/malware reputation database. Its static host rules cannot provide the coverage or update cadence of Chrome Safe Browsing.
2. **DNS comparison limitations**: Public resolvers may return different valid answers because of CDNs, geography, or resolver policy. A response discrepancy is a diagnostic clue, not proof of poisoning. The comparison is not in the request path and cannot block an already-started navigation.
3. **Privacy**: The DNS check sends the active site's hostname to Cloudflare, Google, and AdGuard. Use browser Safe Browsing and a maintained security product for site reputation, and keep the DNS feature's data sharing in mind.
4. **Compatibility**: Page-level API hooks and broad cosmetic selectors can break sites. This project should be treated as experimental until it has automated browser compatibility, security, and regression testing.
