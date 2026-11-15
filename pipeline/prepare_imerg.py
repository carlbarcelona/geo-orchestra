"""Prepare the GeoOrchestra IMERG Monthly V07B package for the Philippines.

Input  : data/raw/imerg_v07b_monthly_ph_subset.bin.gz  (OPeNDAP subset bundle, see pipeline/README.md)
         data/raw/ne/admin0.geojson, data/raw/ne/admin1.geojson  (Natural Earth 10m v5.1.2, public domain)
Output : public/data/imerg-ph/manifest.json, precip_u16.bin, error_u16.bin, regions.json, outline.json, validation.json
         public/data/svs5478/climatology-ph.json  (reconstructed seasonal climatology for the visual feed)

Rules (agreed in the development plan):
  * precipitation stays a rate in mm/hr; fill values (-9999.9) and negatives become MISSING, never 0
  * area means are cos(latitude)-weighted means of valid 0.1 deg cells whose centres fall inside the region polygon
  * valid coverage is exported with every area value; a month with < 50 % valid cells is reported as missing
"""
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import struct
from pathlib import Path

import numpy as np
from shapely import contains_xy
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data" / "imerg-ph"
SVS_OUT = ROOT / "public" / "data" / "svs5478"

FILL = -9999.9
U16_MISSING = 65535
PRECIP_SCALE = 1000.0  # stored = round(mm/hr * 1000)
ERROR_SCALE = 10000.0
MIN_COVERAGE = 0.5
GPS_EPOCH = dt.datetime(1980, 1, 6, tzinfo=dt.timezone.utc)

ISLAND_GROUPS = {
    "luzon": ["National Capital Region", "Central Luzon (Region III)", "Bicol (Region V)",
              "Cordillera Administrative Region (CAR)", "MIMAROPA (Region IV-B)", "CALABARZON (Region IV-A)",
              "Cagayan Valley (Region II)", "Ilocos (Region I)"],
    "visayas": ["Eastern Visayas (Region VIII)", "Western Visayas (Region VI)", "Central Visayas (Region VII)"],
    "mindanao": ["Northern Mindanao (Region X)", "Autonomous Region in Muslim Mindanao (ARMM)", "Davao (Region XI)",
                 "Dinagat Islands (Region XIII)", "SOCCSKSARGEN (Region XII)", "Zamboanga Peninsula (Region IX)"],
}
REGION_LABELS = {
    "philippines": "Philippines (land, Natural Earth outline)",
    "luzon": "Luzon island group",
    "visayas": "Visayas island group",
    "mindanao": "Mindanao island group",
}
# Fixed spatial samples for stereo phrases, ordered west -> east.
SAMPLES = [
    ("puerto-princesa", "Puerto Princesa, Palawan", 9.74, 118.74),
    ("manila", "Manila", 14.60, 120.98),
    ("iloilo", "Iloilo City", 10.72, 122.56),
    ("cebu", "Cebu City", 10.31, 123.89),
    ("davao", "Davao City", 7.07, 125.61),
]


def load_bundle(path: Path):
    raw = gzip.open(path).read()
    n = struct.unpack("<I", raw[:4])[0]
    header = json.loads(raw[4:4 + n])
    arr = np.frombuffer(raw[4 + n:], dtype="<f4").reshape(len(header["granules"]), len(header["vars"]),
                                                           len(header["lon"]), len(header["lat"]))
    return header, arr


def month_key(gps_seconds: int) -> str:
    t = GPS_EPOCH + dt.timedelta(seconds=int(gps_seconds))
    return f"{t.year:04d}-{t.month:02d}"


def expected_months(start=(2000, 6), end=(2024, 12)):
    y, m = start
    out = []
    while (y, m) <= end:
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def to_u16(a: np.ndarray, scale: float) -> np.ndarray:
    out = np.full(a.shape, U16_MISSING, dtype="<u2")
    ok = np.isfinite(a)
    out[ok] = np.clip(np.round(a[ok] * scale), 0, U16_MISSING - 1).astype("<u2")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", default=str(RAW / "imerg_v07b_monthly_ph_subset.bin.gz"))
    ap.add_argument("--months", type=int, default=0, help="limit to the LAST n months (0 = all)")
    args = ap.parse_args()

    header, arr = load_bundle(Path(args.bundle))
    lat = np.array(header["lat"], dtype=float)
    lon = np.array(header["lon"], dtype=float)
    keys = [month_key(t) for t in header["times"]]

    order = np.argsort(keys)
    keys = [keys[i] for i in order]
    arr = arr[order]
    if args.months:
        keys, arr = keys[-args.months:], arr[-args.months:]

    vi = {v: i for i, v in enumerate(header["vars"])}
    precip = arr[:, vi["precipitation"]].astype(np.float64)  # [t, lon, lat]
    error = arr[:, vi["randomError"]].astype(np.float64)
    quality = arr[:, vi["precipitationQualityIndex"]].astype(np.float64)
    for a in (precip, error, quality):
        a[(a <= FILL + 1) | (a < 0)] = np.nan

    # ---- region masks -------------------------------------------------------------------------
    adm1 = json.load(open(RAW / "ne" / "admin1.geojson", encoding="utf-8"))
    adm0 = json.load(open(RAW / "ne" / "admin0.geojson", encoding="utf-8"))
    ph_country = unary_union([shape(f["geometry"]) for f in adm0["features"]
                              if f["properties"].get("ADM0_A3") == "PHL"])
    groups = {}
    for gid, names in ISLAND_GROUPS.items():
        geoms = [shape(f["geometry"]) for f in adm1["features"]
                 if f["properties"].get("adm0_a3") == "PHL" and f["properties"].get("region") in names]
        groups[gid] = unary_union(geoms)
    polys = {"philippines": ph_country, **groups}

    LON, LAT = np.meshgrid(lon, lat, indexing="ij")  # [lon, lat]
    weights = np.cos(np.deg2rad(LAT))
    masks = {rid: contains_xy(g, LON, LAT) for rid, g in polys.items()}

    # region id per cell for the map (0 = outside, 1 luzon, 2 visayas, 3 mindanao, 4 PH but unassigned)
    cell_region = np.zeros(LON.shape, dtype=np.uint8)
    cell_region[masks["philippines"]] = 4
    for code, gid in enumerate(["luzon", "visayas", "mindanao"], start=1):
        cell_region[masks[gid]] = code

    def area_series(mask):
        out = []
        w = weights * mask
        total = mask.sum()
        for t, key in enumerate(keys):
            p = precip[t]
            valid = mask & np.isfinite(p)
            nvalid = int(valid.sum())
            cov = nvalid / total if total else 0.0
            if nvalid == 0 or cov < MIN_COVERAGE:
                out.append({"t": key, "value": None, "randomError": None, "coverage": round(cov, 4),
                            "validCells": nvalid, "quality": "missing"})
                continue
            wv = np.where(valid, w, 0.0)
            val = float(np.nansum(np.where(valid, p, 0.0) * wv) / wv.sum())
            ev = error[t]
            ev_ok = valid & np.isfinite(ev)
            err = float(np.sum(np.where(ev_ok, ev, 0.0) * np.where(ev_ok, w, 0)) / max(np.sum(np.where(ev_ok, w, 0)), 1e-12))
            out.append({"t": key, "value": round(val, 5), "randomError": round(err, 5), "coverage": round(cov, 4),
                        "validCells": nvalid, "quality": "valid" if cov >= 0.999 else "partial"})
        return out, int(total)

    regions = []
    for rid in ["philippines", "luzon", "visayas", "mindanao"]:
        series, ncells = area_series(masks[rid])
        b = polys[rid].bounds
        regions.append({
            "id": rid, "name": REGION_LABELS[rid], "selectionType": "area",
            "aggregation": "area-weighted mean (cos latitude) of valid 0.1° cells whose centres fall inside the polygon",
            "geometryRef": f"outline.json#{rid}", "bounds": [round(x, 3) for x in b], "cellCount": ncells,
            "includesOcean": False, "minCoverage": MIN_COVERAGE, "series": series,
        })

    samples = []
    for sid, name, slat, slon in SAMPLES:
        i = int(np.argmin(np.abs(lon - slon)))
        j = int(np.argmin(np.abs(lat - slat)))
        ser = []
        for t, key in enumerate(keys):
            v = precip[t, i, j]
            ser.append({"t": key, "value": None if not np.isfinite(v) else round(float(v), 4),
                        "randomError": None if not np.isfinite(error[t, i, j]) else round(float(error[t, i, j]), 4),
                        "quality": "valid" if np.isfinite(v) else "missing"})
        samples.append({"id": sid, "name": name, "selectionType": "cell", "aggregation": "none (single 0.1° cell)",
                        "cell": {"lonIndex": i, "latIndex": j, "lat": round(float(lat[j]), 3), "lon": round(float(lon[i]), 3)},
                        "requested": {"lat": slat, "lon": slon}, "series": ser})

    OUT.mkdir(parents=True, exist_ok=True)
    SVS_OUT.mkdir(parents=True, exist_ok=True)

    # ---- grids (time-major, then lat rows north->south? keep [t][lat][lon] south->north for simple indexing) ----
    precip_tll = np.transpose(precip, (0, 2, 1))  # [t, lat, lon]
    error_tll = np.transpose(error, (0, 2, 1))
    to_u16(precip_tll, PRECIP_SCALE).tofile(OUT / "precip_u16.bin")
    to_u16(error_tll, ERROR_SCALE).tofile(OUT / "error_u16.bin")

    # ---- outline (simplified for display only; masks above use full-resolution polygons) ----
    outline = {"type": "FeatureCollection", "features": []}
    for rid, g in polys.items():
        outline["features"].append({"type": "Feature", "id": rid,
                                    "properties": {"id": rid, "name": REGION_LABELS[rid]},
                                    "geometry": mapping(g.simplify(0.01, preserve_topology=True))})
    (OUT / "outline.json").write_text(json.dumps(outline, separators=(",", ":")))

    regions_doc = {
        "version": 1, "datasetId": "imerg-monthly-v07b-ph", "unit": "mm/hr", "months": keys,
        "regions": regions, "samples": samples,
        "cellRegion": {"encoding": "uint8 [lat][lon], south->north, west->east; 0 outside, 1 luzon, 2 visayas, 3 mindanao, 4 other PH",
                       "data": cell_region.T.flatten().tolist()},
    }
    (OUT / "regions.json").write_text(json.dumps(regions_doc, separators=(",", ":")))

    manifest = {
        "contract": "dataset-manifest", "version": 1,
        "datasetId": "imerg-monthly-v07b-ph", "datasetVersion": "GPM_3IMERGM V07B",
        "title": "IMERG Final Monthly Precipitation — Philippines subset",
        "variable": "precipitation", "longName": "Merged microwave-infrared-gauge precipitation estimate",
        "unit": "mm/hr", "unitNote": "Monthly mean precipitation rate, not accumulated rainfall.",
        "cadence": "monthly", "coverage": {"start": keys[0], "end": keys[-1], "count": len(keys),
                                             "target": {"start": "2000-06", "end": "2024-12", "count": 295}},
        "grid": {"nlat": len(lat), "nlon": len(lon), "lat0": float(lat[0]), "lon0": float(lon[0]), "step": 0.1,
                 "cellRegistration": "centre", "extent": [float(lon[0] - 0.05), float(lat[0] - 0.05), float(lon[-1] + 0.05), float(lat[-1] + 0.05)],
                 "layout": "uint16 little-endian [month][lat][lon], lat south->north, lon west->east",
                 "precipitation": {"path": "precip_u16.bin", "scale": 1 / PRECIP_SCALE, "missing": U16_MISSING},
                 "randomError": {"path": "error_u16.bin", "scale": 1 / ERROR_SCALE, "missing": U16_MISSING}},
        "quality": {"native": ["randomError (RMS error estimate, mm/hr)", "precipitationQualityIndex (retained in raw bundle)"],
                    "appDerived": "availability = valid | partial | missing, computed by GeoOrchestra from fill values and coverage"},
        "source": {"provider": "NASA GES DISC / GPM", "doi": "10.5067/GPM/IMERG/3B-MONTH/07",
                   "url": "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGM_07/summary",
                   "access": header["source"], "granules": len(header["granules"]),
                   "citation": "Huffman, G.J., E.F. Stocker, D.T. Bolvin, E.J. Nelkin, J. Tan (2023), GPM IMERG Final Precipitation L3 1 month 0.1 degree x 0.1 degree V07, Greenbelt, MD, Goddard Earth Sciences Data and Information Services Center (GES DISC), doi:10.5067/GPM/IMERG/3B-MONTH/07"},
        "preparation": {"script": "pipeline/prepare_imerg.py", "prepared": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                        "subset": {"lonIndex": header["lonIndex"], "latIndex": header["latIndex"]},
                        "missingRule": "values equal to _FillValue -9999.9 or negative are missing; never converted to 0",
                        "boundaries": "Natural Earth 10m admin-0/admin-1 v5.1.2 (public domain)"},
        "assets": {"regions": "regions.json", "outline": "outline.json", "validation": "validation.json"},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))

    # ---- climatology reconstruction for the SVS 5478 visual feed --------------------------------
    clim = build_climatology(keys, regions)
    (SVS_OUT / "climatology-ph.json").write_text(json.dumps(clim, separators=(",", ":")))

    # ---- validation ------------------------------------------------------------------------------
    exp = expected_months()
    present = set(keys)
    validation = {
        "generated": manifest["preparation"]["prepared"],
        "expectedMonths": len(exp), "presentMonths": len(keys),
        "missingMonths": [m for m in exp if m not in present],
        "unexpectedMonths": [m for m in keys if m not in set(exp)],
        "duplicates": len(keys) - len(present),
        "ordered": keys == sorted(keys),
        "unit": "mm/hr",
        "gridShape": [len(keys), len(lat), len(lon)],
        "missingCells": int(np.isnan(precip).sum()),
        "valueRange": [float(np.nanmin(precip)), float(np.nanmax(precip))],
        "spotChecks": spot_checks(keys, lat, lon, precip),
        "regionCells": {r["id"]: r["cellCount"] for r in regions},
    }
    (OUT / "validation.json").write_text(json.dumps(validation, indent=2))
    print(json.dumps({k: validation[k] for k in ["expectedMonths", "presentMonths", "duplicates", "ordered",
                                                    "missingCells", "valueRange", "regionCells"]}))
    for s in validation["spotChecks"]:
        print("spot", s)


def spot_checks(keys, lat, lon, precip):
    """Independent single-cell values requested separately from OPeNDAP CSV (see README)."""
    refs = [  # (month, lat, lon, value from a separate single-cell .dap.csv request, 14 Nov 2026)
        ("2000-06", 13.15, 122.05, 0.338), ("2010-07", 14.55, 121.05, 0.552),
        ("2013-11", 11.25, 124.95, 0.511), ("2024-12", 7.05, 125.55, 0.311),
        ("2024-01", 4.55, 116.05, 0.235),
    ]
    out = []
    for m, la, lo, ref in refs:
        if m not in keys:
            continue
        t, i, j = keys.index(m), int(np.argmin(np.abs(lon - lo))), int(np.argmin(np.abs(lat - la)))
        v = float(precip[t, i, j])
        out.append({"month": m, "lat": la, "lon": lo, "source": ref, "processed": round(v, 4), "match": abs(v - ref) < 5e-4})
    return out


def build_climatology(keys, regions):
    """Approximate the SVS 5478 daily climatology (2001-2022, trailing 30-day mean) for each region
    from monthly IMERG V07B. This is a RECONSTRUCTION: monthly means are placed at mid-month, linearly
    interpolated (periodic) to 366 days, then smoothed with a trailing 30-day mean."""
    # 366-day seasonal year (the SVS 5478 overlays include February 29); mid-month positions, 0-based
    lengths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    starts = np.cumsum([0] + lengths[:-1])
    mid = starts + (np.array(lengths) - 1) / 2.0
    ndays = 366
    out = {"version": 1, "contract": "climatology-linkage", "unit": "mm/hr", "years": [2001, 2022], "days": 366,
           "status": "reconstructed",
           "method": "Monthly IMERG V07B area means for 2001–2022 → 12 calendar-month means placed at mid-month → periodic linear interpolation to days 1–365 → trailing 30-day mean (as in SVS 5478). Not the SVS daily product; values are approximate.",
           "regions": []}
    for r in regions:
        by_month = {m: [] for m in range(1, 13)}
        for s in r["series"]:
            y, m = int(s["t"][:4]), int(s["t"][5:])
            if 2001 <= y <= 2022 and s["value"] is not None:
                by_month[m].append(s["value"])
        if any(len(v) == 0 for v in by_month.values()):
            continue
        monthly = np.array([np.mean(by_month[m]) for m in range(1, 13)])
        counts = [len(by_month[m]) for m in range(1, 13)]
        days = np.arange(ndays)
        xp = np.concatenate([mid - ndays, mid, mid + ndays])
        fp = np.concatenate([monthly, monthly, monthly])
        daily = np.interp(days, xp, fp)
        ext = np.concatenate([daily[-29:], daily])
        trailing = np.array([ext[d:d + 30].mean() for d in range(ndays)])
        out["regions"].append({"id": r["id"], "name": r["name"], "monthlyMeans": [round(float(v), 5) for v in monthly],
                               "yearsPerMonth": counts, "daily": [round(float(v), 5) for v in trailing]})
    return out


if __name__ == "__main__":
    main()
