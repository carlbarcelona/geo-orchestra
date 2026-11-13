"""Decode NASA SVS 5478 frames through NASA's published colorbar and extract per-frame features.

Input : data/raw/svs5478/SOS_IMERG_cbar_1000px.png (colorbar, 0-24 mm/day)
        data/raw/svs5478/frames/#####.png               (lossless 2048x1024 source frames, cached by prepare_svs.py)
        public/data/svs5478/manifest.json                (day -> representative source frame)
        public/data/svs5478/climatology-ph.json          (reconstructed IMERG climatology, for cross-validation)
        data/raw/ne/admin0.geojson                       (Philippines outline for the land-mask comparison)
Output: public/data/svs5478/frame-scan.bin      uint8 [day][row][col], 0.1 mm/day per step, 255 = unknown
        public/data/svs5478/frame-features.json per-day features + decodeValidation

These values are IMAGE-DERIVED: colours are decoded back to mm/day through the colorbar. They are approximate,
labelled as such in the app, and validated against the measurement-based reconstruction below.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from shapely import contains_xy
from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data" / "svs5478"

# ---- colorbar geometry (measured from SOS_IMERG_cbar_1000px.png) ----------------------------------
CB_ROW = 176                              # a gradient row free of tick marks
TICKS_X = [155, 219, 283, 346, 410, 473, 537, 601, 664, 728, 791]   # 2, 4, ... 22 mm/day
TICKS_V = [2 * (i + 1) for i in range(len(TICKS_X))]
SLOPE, INTERCEPT = np.polyfit(TICKS_X, TICKS_V, 1)
X_START, X_END = 95, 855                  # first clean gradient pixel ... the 24 mm/day tick
DRY_ANCHOR = (3, 16, 20)                  # darkest frame colour (0 mm/day; the bar's own 0 end is under its border)
MAX_DIST = 40.0                           # colours farther than this from the colorbar are "unknown" (coastlines, labels)

ROI = {"lonMin": 95.0, "lonMax": 150.0, "latMin": -10.0, "latMax": 30.0}
NCOL, NROW = 55, 40                       # 1 degree cells
MIN_KNOWN = 0.5
WET_MM_DAY = 8.0                          # colorbar turns green at 8 mm/day
SECTOR = (115.0, 130.0)                   # Philippine longitude sector for the rain-band latitude
PH_BOX = (116.0, 127.5, 4.5, 21.5)        # lon0, lon1, lat0, lat1


def x_to_value(x: float) -> float:
    return float(SLOPE * x + INTERCEPT)


def build_lut():
    cb = np.asarray(Image.open(RAW / "svs5478" / "SOS_IMERG_cbar_1000px.png").convert("RGB")).astype(np.float64)
    xs = np.arange(X_START, X_END + 1)
    colors = cb[CB_ROW, xs]
    values = np.array([x_to_value(x) for x in xs])
    colors = np.vstack([np.array(DRY_ANCHOR, dtype=np.float64), colors])
    values = np.concatenate([[0.0], np.clip(values, 0, 24)])
    return cb, colors, values


def build_cube(colors, values, q=4):
    """Nearest-colour lookup cube on a 64^3 RGB grid (q=4) -> (value, distance)."""
    levels = np.arange(0, 256, q) + q / 2
    r, g, b = np.meshgrid(levels, levels, levels, indexing="ij")
    pts = np.stack([r.ravel(), g.ravel(), b.ravel()], axis=1)
    best_d = np.full(len(pts), np.inf)
    best_v = np.zeros(len(pts))
    for k in range(0, len(colors), 64):
        c = colors[k:k + 64]
        d = np.sqrt(((pts[:, None, :] - c[None, :, :]) ** 2).sum(2))
        i = d.argmin(1)
        dm = d[np.arange(len(pts)), i]
        upd = dm < best_d
        best_d[upd] = dm[upd]
        best_v[upd] = values[k:k + 64][i[upd]]
    shape3 = (len(levels),) * 3
    return best_v.reshape(shape3), best_d.reshape(shape3), q


def decode(rgb: np.ndarray, cube):
    vals, dists, q = cube
    idx = (rgb // q).astype(np.int64)
    v = vals[idx[..., 0], idx[..., 1], idx[..., 2]]
    d = dists[idx[..., 0], idx[..., 1], idx[..., 2]]
    v = v.copy()
    v[d > MAX_DIST] = np.nan
    return v


def main():
    cb, colors, values = build_lut()
    cube = build_cube(colors, values)

    # round-trip check on the colorbar itself
    tick_vals = decode(cb[CB_ROW, TICKS_X].astype(np.int64), cube)
    roundtrip = float(np.nanmax(np.abs(tick_vals - np.array(TICKS_V))))
    assert roundtrip <= 0.3, f"colorbar round-trip error {roundtrip:.2f} mm/day > 0.3"

    manifest = json.load(open(OUT / "manifest.json"))
    clim = json.load(open(OUT / "climatology-ph.json"))
    ph_clim = next(r for r in clim["regions"] if r["id"] == "philippines")["daily"]
    adm0 = json.load(open(RAW / "ne" / "admin0.geojson", encoding="utf-8"))
    ph_poly = unary_union([shape(f["geometry"]) for f in adm0["features"] if f["properties"].get("ADM0_A3") == "PHL"])

    W, H = 2048, 1024
    px = lambda lon: (lon + 180) / 360 * W  # noqa: E731
    py = lambda lat: (90 - lat) / 180 * H   # noqa: E731
    x0, x1 = int(round(px(ROI["lonMin"]))), int(round(px(ROI["lonMax"])))
    y0, y1 = int(round(py(ROI["latMax"]))), int(round(py(ROI["latMin"])))
    # pixel-centre coordinates within the ROI crop
    lons = ((np.arange(x0, x1) + 0.5) / W) * 360 - 180
    lats = 90 - ((np.arange(y0, y1) + 0.5) / H) * 180
    LON, LAT = np.meshgrid(lons, lats)
    land = contains_xy(ph_poly, LON, LAT)
    wcos = np.cos(np.deg2rad(LAT))
    box = (LON >= PH_BOX[0]) & (LON <= PH_BOX[1]) & (LAT >= PH_BOX[2]) & (LAT <= PH_BOX[3])
    col_of = np.clip(((LON - ROI["lonMin"]) // 1).astype(int), 0, NCOL - 1)
    row_of = np.clip(((LAT - ROI["latMin"]) // 1).astype(int), 0, NROW - 1)   # row 0 = south

    grids = np.full((len(manifest["frames"]), NROW, NCOL), 255, dtype=np.uint8)
    feats = []
    unknown_total = 0.0
    for f in manifest["frames"]:
        d = f["day"] - 1
        im = np.asarray(Image.open(RAW / "svs5478" / "frames" / f"{f['sourceFrame']:05d}.png").convert("RGB"))
        crop = im[y0:y1, x0:x1].astype(np.int64)
        v = decode(crop, cube)
        known = ~np.isnan(v)
        unknown_total += 1 - known.mean()
        # 1-degree cell medians
        cell = np.full((NROW, NCOL), np.nan)
        for r in range(NROW):
            rmask = row_of == r
            for c in range(NCOL):
                m = rmask & (col_of == c)
                n = m.sum()
                k = m & known
                if n and k.sum() >= MIN_KNOWN * n:
                    cell[r, c] = float(np.median(v[k]))
        ok = ~np.isnan(cell)
        grids[d][ok] = np.clip(np.round(cell[ok] * 10), 0, 254).astype(np.uint8)

        lm = land & known
        ph_land = float(np.sum(v[lm] * wcos[lm]) / np.sum(wcos[lm])) if lm.any() else None
        bm = box & known
        ph_box = float(np.sum(v[bm] * wcos[bm]) / np.sum(wcos[bm])) if bm.any() else None
        roi_mean = float(np.nanmean(cell))
        roi_max = float(np.nanmax(cell))
        wet = float(np.mean(cell[ok] >= WET_MM_DAY))
        # rain-band latitude in the Philippine sector: centroid of rows within 70% of the peak row
        c0, c1 = int(SECTOR[0] - ROI["lonMin"]), int(SECTOR[1] - ROI["lonMin"])
        prof = np.nanmean(cell[:, c0:c1], axis=1)
        prof = np.convolve(np.nan_to_num(prof), np.ones(3) / 3, mode="same")
        peak = prof.max()
        sel = prof >= 0.7 * peak
        row_lats = ROI["latMin"] + 0.5 + np.arange(NROW)
        band = float(np.sum(row_lats[sel] * prof[sel]) / np.sum(prof[sel])) if peak > 0 else None
        feats.append({"day": f["day"], "label": f["label"], "phLandMmDay": round(ph_land, 3) if ph_land is not None else None,
                      "phBoxMmDay": round(ph_box, 3) if ph_box is not None else None, "roiMeanMmDay": round(roi_mean, 3),
                      "roiMaxMmDay": round(roi_max, 2), "wetPct": round(wet * 100, 1), "bandLat": round(band, 2) if band is not None else None,
                      "bandPeakMmDay": round(float(peak), 2), "unknownPct": round(float(1 - known.mean()) * 100, 2)})

    n = len(feats)
    for i, ft in enumerate(feats):
        prev = feats[(i - 14) % n]["bandLat"]
        delta = None if ft["bandLat"] is None or prev is None else round(ft["bandLat"] - prev, 2)
        ft["bandDelta14"] = delta
        ft["bandTrend"] = "steady" if delta is None or abs(delta) < 0.5 else ("north" if delta > 0 else "south")

    img = np.array([f["phLandMmDay"] for f in feats], dtype=float)
    meas = np.array(ph_clim, dtype=float) * 24
    r = float(np.corrcoef(img, meas)[0, 1])
    bias = float(np.mean(img - meas))
    jan15, jul15 = feats[14]["bandLat"], feats[196]["bandLat"]
    validation = {
        "colorbarRoundTripMaxErrorMmDay": round(roundtrip, 3),
        "colorbarCalibration": {"ticksX": TICKS_X, "ticksMmDay": TICKS_V, "slope": round(float(SLOPE), 6), "intercept": round(float(INTERCEPT), 4)},
        "unknownPixelPct": round(unknown_total / n * 100, 2),
        "vsReconstructedClimatology": {"region": "philippines (land)", "pearsonR": round(r, 3), "meanBiasMmDay": round(bias, 3),
                                        "meanImageMmDay": round(float(img.mean()), 3), "meanMeasuredMmDay": round(float(meas.mean()), 3)},
        "bandLatJan15": jan15, "bandLatJul15": jul15,
        "note": "Image-derived values decoded through NASA's colorbar; approximate. Compared with the IMERG-based reconstruction (×24 to mm/day).",
    }
    doc = {"contract": "frame-scan", "version": 1, "unit": "mm/day", "source": "decoded from NASA SVS 5478 frames via the published colorbar",
           "grid": {"ncol": NCOL, "nrow": NROW, "lonMin": ROI["lonMin"], "latMin": ROI["latMin"], "step": 1.0, "scale": 0.1, "unknown": 255,
                    "layout": "uint8 [day][row][col], row 0 = southernmost (-9.5°), col 0 = westernmost (95.5°E)", "path": "frame-scan.bin"},
           "thresholds": {"wetMmDay": WET_MM_DAY, "sectorLon": list(SECTOR), "phBox": list(PH_BOX)},
           "decodeValidation": validation, "days": feats}
    grids.tofile(OUT / "frame-scan.bin")
    (OUT / "frame-features.json").write_text(json.dumps(doc, separators=(",", ":")))
    print(json.dumps(validation, indent=1))
    if r < 0.8:
        raise SystemExit(f"Decoded vs reconstructed correlation r={r:.3f} < 0.8 — do not ship image features.")


if __name__ == "__main__":
    main()
