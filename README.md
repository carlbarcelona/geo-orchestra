# GeoOrchestra — the Earth Information Jukebox

NASA Space Apps Challenge 2026 · *The Earth Information Jukebox*

GeoOrchestra turns NASA precipitation measurements into sound you can inspect. It has two workspaces that share one project, one sound engine and **one playback clock**:

| Workspace | What it shows | Data |
| --- | --- | --- |
| **Numerical** | Table · Map · Graph of monthly rainfall for the Philippines, Musical or Geophony sonification, a rolling piano roll | GPM IMERG Final Monthly **V07B**, 0.1°, **Jun 2000 – Dec 2024 (295 months, all verified)** |
| **Visual feed** | Authentic NASA SVS / EIC frames of the IMERG daily precipitation climatology, synchronized with sound, graph and piano roll | NASA SVS **5478** (2001–2022 seasonal cycle, 366 dated days), linked to a **reconstructed** climatology |

Every sound event records its date, its location or aggregation, the original value in mm/hr, and the mapping that produced it.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 22 checks of the risky transformations
npm run build && npm run preview
```

The prepared data is static under `public/data/`, so no backend or live NASA connection is needed at runtime.

## Using it (demo path)

1. **Numerical → NASA sample.** This loads 295 months. The Philippines land area is selected by default and shown as an area mean.
2. Use **Table / Map / Graph**. Selecting a time anywhere moves the shared cursor in every view. Clicking a map cell pins a single 0.1° cell.
3. Press **Space** to play Musical sonification, switch to **Geophony**, then click a note and open **Event details**.
4. Use **Audio legend** to audition low, middle, high, zero and missing cases.
5. In the **Visual feed**:
   1. **Import visual feed**. The authentic SVS frames appear, but audio and graphs stay disabled.
   2. **Connect climatology**. Its status shows *Reconstructed — approximate*.
   3. Play, toggle **ROI**, and open **Frame alignment** to see the evidence.

Keyboard: `Space` play/pause · `L` loop · `←/→` step · `Home/End` · `?`.

## Data preparation (reproducible)

```bash
python -m venv pipeline/.venv && pipeline/.venv/Scripts/pip install numpy pillow shapely
# 1. IMERG subset (needs your own Earthdata Login in ~/.netrc; see the script header)
pipeline/.venv/Scripts/python pipeline/fetch_imerg_subset.py
# 2. Natural Earth boundaries (public domain)
curl -L -o data/raw/ne/admin0.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson
curl -L -o data/raw/ne/admin1.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson
# 3. Build the packages
pipeline/.venv/Scripts/python pipeline/prepare_imerg.py   # → public/data/imerg-ph + svs5478/climatology-ph.json
pipeline/.venv/Scripts/python pipeline/prepare_svs.py     # → public/data/svs5478 (public SVS assets, ~800 MB cache)
```

Validation results are written to `public/data/imerg-ph/validation.json` and `public/data/svs5478/alignment.json`. See [docs/verification.md](docs/verification.md).

## Documentation

- [docs/mapping-guide.md](docs/mapping-guide.md): how data becomes sound
- [docs/processed-format.md](docs/processed-format.md): the JSON import format (example in `public/data/examples/`)
- [docs/verification.md](docs/verification.md): what was checked and how
- [docs/accessibility.md](docs/accessibility.md): accessibility provisions and limits
- [docs/limitations.md](docs/limitations.md): known limitations and release status
- [docs/demo-script.md](docs/demo-script.md): presentation walkthrough
- [docs/attribution.md](docs/attribution.md): sources and credits

## Architecture

```
pipeline/ (Python)  IMERG OPeNDAP subset → validate → area means + grid → static JSON/uint16
                    SVS 5478 frames → date-overlay alignment → WebP derivatives + manifest
src/contracts       dataset manifest · observation/selection · sound event · visual media manifest
src/data            loaders (NASA sample, synthetic demo, processed JSON), aggregation
src/playback        PlaybackController — the single Tone.js transport; monthly + seasonal adapters
src/sound           mapping.ts (pure, deterministic) · engine.ts (instruments, geophony, channels)
src/state           zustand store + actions (the only place views, controller and engine meet)
src/ui              numerical / visual / shared components
```
