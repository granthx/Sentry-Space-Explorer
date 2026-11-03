# Space Explorer

Space Explorer is a NASA space observation and mission intelligence platform. Built with a high-concurrency FastAPI backend and a responsive, zero-build, dependency-free frontend, Space Explorer consolidates deep-space imagery, near-Earth asteroid tracking, Mars rover exploration, embedded machine-learning inference engines, and conversational AI telemetry into a unified mission control interface.

---

## 1. System Architecture & Invariants

Space Explorer is structured around a decoupled multi-tier architecture ensuring high throughput, credential isolation, sub-millisecond cached responses, and non-blocking machine learning inference.

```
Browser Interface (frontend/)
  │  Vanilla HTML5 / Modern CSS / ES6 JavaScript
  │  Zero build toolchains, zero npm dependencies, zero node_modules
  │  Strict Content-Security-Policy (CSP) & textContent-only DOM rendering
  │
  ▼ [JSON REST API over HTTP/2]
FastAPI Application Core (backend/app/)
  │  Request validation & standard error schemas (routers/)
  │  Statistical aggregation & data normalization (services/)
  │  Conversational AI Assistant engine with ReAct tool calling (assistant/)
  │  Embedded ONNX Runtime machine learning inference engine (ml/)
  │  In-memory thread-safe LRU / TTL caching engine (cache.py)
  │
  ▼ [Asynchronous HTTP with Quota Management & Embedded Models]
Upstream NASA & ML Services (nasa_client.py, ml/)
  │  NASA APOD API · NASA NeoWs (Asteroid) API
  │  NASA Mars Rover Manifests & Image Library
  │  NASA Exoplanet Archive & Kepler Light Curves
  │  NASA JPL AI4Mars Rover Terrain Segmentation
  │  NASA SMAP & Curiosity Rover Telemetry
  │  Groq Cloud LLM Inference Engine
```

### Architectural Roles & Separation of Concerns

- **`frontend/`**: Client-side presentation and interaction layer. Developed in pure HTML5, CSS3, and modern JavaScript without build steps or npm packages. Employs strict DOM safety patterns (exclusively updating elements via `textContent` and parameterized DOM nodes, eliminating `innerHTML` injection risks). Fully accessible with keyboard navigation, ARIA semantics, and `prefers-reduced-motion` compliance.
- **`routers/`**: HTTP endpoint dispatch, query validation, and status code negotiation. Contains no direct external network calls. Maps internal conditions to standardized API error envelopes (`{"error": {"status": ..., "message": ...}}`).
- **`services/`**: Core business domain logic, data transformation, statistical series bucketing, and rover manifest analysis. Returns native typed dictionaries used simultaneously by REST endpoints and by the AI Assistant's tool executors.
- **`ml/`**: Embedded machine-learning inference subsystem utilizing ONNX Runtime. Provides thread-pool isolated execution to ensure CPU-bound tensor operations never block the asynchronous event loop.
- **`nasa_client.py`**: Upstream gateway and quota isolation layer. The only backend module permitted to import `httpx`. Centralizes timeout protection, API key injection, rate-limit header parsing, and fallback recovery.
- **`assistant/`**: Conversational intelligence system operating on a ReAct (Reasoning + Acting) loop with deterministic tool execution over verified service functions. Equipped with prompt injection defenses, turn caps, and rate limits.
- **`cache.py`**: In-memory thread-safe TTL cache. Protects upstream NASA rate limits by serving cached responses for astronomical pictures, asteroid windows, and rover manifests.

---

## 2. Platform Modules & Features

### Astronomy Picture of the Day
- **Daily Featured Media**: Displays NASA's daily featured astronomical image or interactive video player accompanied by professional astronomer annotations.
- **Historical Archive Exploration**: Date selector providing direct access to NASA's image archives spanning back to June 16, 1995.
- **Resilient Fallback Engine**: Curated high-resolution fallback assets ensuring zero broken images during upstream NASA content outages.
- **Ambient Starfield**: Mathematical Canvas-based dynamic background starfield with viewport adaptation and reduced-motion detection.

### Asteroid Tracker — Tactical SENTRY Command
- **Interactive 3D Geocentric Vector Globe**: High-precision Canvas 2D projection rendering a wireframe Earth, continental contours, Low Earth Orbit (LEO) satellite swarm, the Moon's orbital plane at 1 Lunar Distance ($1\text{ LD} \approx 384,400\text{ km}$), and 3D hyperbolic encounter trajectory vectors. Supports full mouse/touch drag rotation, zoom scaling, auto-spin, and camera reset.
- **360° Phosphor Radar Sweep**: Polar proximity grid plotting near-Earth objects in Lunar Distances, featuring a continuous rotating cathode radar sweep beam with trailing phosphor persistence and azimuth degree rings ($000^\circ$, $090^\circ$, $180^\circ$, $270^\circ$).
- **4D Mission Time Scrubber**: Interactive timeline playback with variable simulation speeds ($1\times$, $5\times$, $20\times$), encounter pips, perigee countdowns, and real-time interpolation of asteroid trajectory vectors in both 3D and radar views.
- **Live CNEOS Telemetry Downlink Terminal**: Real-time monospace data stream logging orbital ephemeris packets, target state vectors, lock-on designations, and approach notices.
- **Holographic Targeting Drawer**: Slide-out detail inspector featuring a rotating 3D polyhedral asteroid wireframe mesh, tri-level MAGI threat assessment banner (Level 0 / Level 1 / Level 2), analytical risk gauges, multi-unit telemetry (LD, km, AU, light-seconds, Mach velocity), human-scale comparative visual gauge, and historical approach logs.

### Mars Image Explorer
- **Multi-Rover Mission Coverage**: High-resolution image search across NASA's Curiosity, Perseverance, Opportunity, and Spirit rover archives.
- **Camera & Sol Filtering**: Filter by specific rover instrument cameras (MAST, NAVCAM, HAZCAM, CHEMCAM, PANCAM) and mission sol or Earth date.
- **Modal Lightbox Inspection**: Full-screen high-fidelity asset viewer with image metadata extraction and NASA library identifiers.
- **The Sky That Day**: Synchronous dual-summary providing the APOD feature and closest asteroid flyby that occurred on the date the rover photo was captured.

### Mars Data Lab & Conversational AI
- **Cross-Mission Telemetry**: Comparative operational statistics across rovers, including active mission sols, quiet intervals, camera usage distributions, and productivity indices.
- **Photo Production Bucketing**: Sol-bucketed temporal volume analysis highlighting mission phases and peak survey activity.
- **Cumulative Growth Curves**: Normalized `same_age` sol-indexed comparison curves tracking cumulative photograph production across rovers.
- **Embedded AI Assistant**: Conversational assistant powered by Groq LLM tool calling (and optional LangGraph stateful engine) capable of answering complex inquiries using live asteroid orbits, planetary data, and rover manifests.

### Exoplanet Finder
- **1-D CNN Transit Detection**: Evaluates Kepler light curves to differentiate genuine planetary transits from astrophysical false positives (such as eclipsing binaries and background stars). Replicates the deep-learning methodology Google researchers applied to identify Kepler-90i.
- **Median-Normalized Signal Processing**: Maps variable raw flux curves to 178 evenly spaced flux bins, isolating genuine stellar flux dips.
- **Interactive Flux Visualizer**: Renders 64-point down-sampled light-curve profiles with transit confidence percentages and orbital period annotations.

### Mars Terrain Segmentation
- **Autonomous Navigation Classifier**: Pixel-wise segmentation classifying rover camera imagery into four terrain categories: soil, bedrock, sand, and large obstacles.
- **AI4Mars JPL Ground Truth**: Built upon the NASA Jet Propulsion Laboratory AI4Mars dataset collected from thousands of volunteer annotations on Curiosity rover imagery.
- **Driveability Safety Metric**: Calculates immediate safety coefficients to evaluate hazard risks (such as the soft-sand entrapment that immobilized NASA's Spirit rover in 2009).

### Spacecraft Anomaly Detection
- **LSTM Autoencoder Reconstruction**: Learns normal spacecraft housekeeping telemetry baselines and flags unusual sensor behavior, drift, and spikes.
- **Flight Telemetry Support**: Evaluates sensor channels from NASA's Soil Moisture Active Passive (SMAP) satellite and the Mars Science Laboratory (Curiosity) rover.
- **Dynamic Thresholding**: Computes sliding-window Mean Squared Error ($25\text{-step windows}$ with $5\text{-step stride}$) against 95th-percentile error baselines to categorize severity from low to high.

---

## 3. API Endpoints Specification

| Method | Path | Summary & Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Instant readiness and liveness probe reporting cache metrics, assistant configuration, and API key mode. |
| `GET` | `/api/health/upstream` | Deep connectivity diagnostic testing live connectivity to APOD, NeoWs, and NASA Image Library. |
| `GET` | `/api/modules` | Platform capability registry reporting active modules and build phases. |
| `GET` | `/api/apod` | Astronomy Picture of the Day (supports optional `date=YYYY-MM-DD`). |
| `GET` | `/api/apod/random` | Random sampling of historical APOD items (`count=1..6`). |
| `GET` | `/api/asteroids` | 7-day Near-Earth Object feed with proximity metrics, closest pass, and hazard counts. |
| `GET` | `/api/asteroids/{id}` | Detailed asteroid orbital parameters, eccentricity, inclination, and approach records. |
| `GET` | `/api/mars/rovers` | Rover mission manifests for Curiosity, Perseverance, Opportunity, and Spirit. |
| `GET` | `/api/mars/library` | Paginated search of the NASA Image and Video Library with thumbnail verification. |
| `GET` | `/api/mars/library/{id}` | Asset manifest detailing high-resolution download links for a specific photo. |
| `GET` | `/api/mars/day` | Dual astronomical summary for any date (APOD + closest asteroid flyby). |
| `GET` | `/api/lab/overview` | Aggregated statistical indicators across all Mars rovers. |
| `GET` | `/api/lab/rovers/{rover}/stats` | Detailed rover statistics covering active sols, quiet gaps, and camera distributions. |
| `GET` | `/api/lab/rovers/{rover}/series` | Sol-bucketed photo production timeline. |
| `GET` | `/api/lab/compare` | Normalized cross-rover cumulative photo comparison curves. |
| `POST` | `/api/assistant/chat` | AI conversational endpoint with automated tool invocation and prompt defense. |
| `GET` | `/api/exoplanets/predict` | 1-D CNN Kepler light-curve classifier predicting transit probability and confidence. |
| `GET` | `/api/exoplanets/samples` | Registry of bundled Kepler targets available for offline evaluation. |
| `POST` | `/api/terrain/segment` | Pixel-wise Mars rover surface classifier segmenting soil, bedrock, sand, and rock. |
| `GET` | `/api/terrain/classes` | Terrain class ontology, palette definitions, and driveability categories. |
| `GET` | `/api/anomaly/detect` | LSTM autoencoder sensor anomaly detector over sliding telemetry windows. |
| `GET` | `/api/anomaly/channels` | Catalog of bundled SMAP satellite and Curiosity rover telemetry channels. |

---

## 4. Security & Defense In Depth

Space Explorer enforces strict production security headers on all HTTP responses:

- **`Content-Security-Policy (CSP)`**: Restricts script origins strictly to `'self'` and trusted CDNs (`cdnjs.cloudflare.com` for Chart.js); limits styling and fonts to Google Fonts; restricts image and media sources strictly to official NASA CDNs; restricts frame embedding exclusively to authorized YouTube video players.
- **`X-Content-Type-Options: nosniff`**: Prevents browser MIME-sniffing vulnerabilities.
- **`Referrer-Policy: strict-origin-when-cross-origin`**: Protects sensitive internal paths during external navigation.
- **Prompt Injection & Abuse Defenses**: The AI assistant inspects conversational input for instruction override patterns, rejects suspicious queries, and enforces per-turn and per-session token limits.
- **Quota Protection & Isolation**: NASA API credentials never leak to the client; all requests proxy through the backend with in-memory caching and automatic rate-limit quota tracking.
- **ML Sandbox & Isolation**: ONNX models run in isolated CPU execution sessions with controlled single-thread limits to prevent resource contention.

---

## 5. Testing & Quality Assurance

Space Explorer maintains a 100% offline unit and integration test suite:

- **Deterministic Fixtures**: All external HTTP interactions and LLM responses are simulated via recorded fixtures, ensuring zero outbound network traffic during test execution.
- **Comprehensive Coverage**: 146 unit and integration tests covering data contract verification, orbital mathematics, assistant tool execution, and machine learning inference.
- **Contract Verification**: Validates upstream data contracts and normalization logic across APOD, NeoWs, Mars manifests, Image Library, and ML predictions.
- **Security & Error Tests**: Verifies HTTP error handling, rate limiting, prompt defense, and header propagation.
- **Continuous Integration**: Automated test verification runs on every push and pull request across Python 3.12 and Python 3.13.
