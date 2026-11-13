"""Fetch the Philippines subset of GPM_3IMERGM V07B (Jun 2000 – Dec 2024) from NASA Earthdata Cloud OPeNDAP.

Writes data/raw/imerg_v07b_monthly_ph_subset.bin.gz in the same bundle format used by prepare_imerg.py.

Authentication: a free NASA Earthdata Login account with the "NASA GESDISC DATA ARCHIVE" application approved.
Put your credentials in ~/.netrc (Windows: %USERPROFILE%\\_netrc) yourself:
    machine urs.earthdata.nasa.gov login <username> password <password>
This script never asks for or prints credentials.

Note: the original 14 Nov 2026 bundle was retrieved with the same OPeNDAP requests from an authenticated
browser session (the legacy gpm1.gesdisc server no longer answers). This script reproduces those requests.
"""
from __future__ import annotations

import concurrent.futures as cf
import datetime as dt
import gzip
import http.cookiejar
import json
import netrc
import os
import struct
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "imerg_v07b_monthly_ph_subset.bin.gz"
COLLECTION = "C2723754851-GES_DISC"
CMR = ("https://cmr.earthdata.nasa.gov/search/granules.json?short_name=GPM_3IMERGM&version=07"
       "&temporal=2000-06-01T00:00:00Z,2024-12-31T23:59:59Z&page_size=400&sort_key=start_date")
LON = (2960, 3074)   # 116.05 .. 127.45 E
LAT = (945, 1114)    # 4.55 .. 21.45 N
VARS = ["precipitation", "randomError", "precipitationQualityIndex"]


def opener():
    rc_path = Path(os.environ.get("NETRC", Path.home() / ("_netrc" if os.name == "nt" else ".netrc")))
    auth = netrc.netrc(rc_path).authenticators("urs.earthdata.nasa.gov")
    if not auth:
        sys.exit(f"No urs.earthdata.nasa.gov entry in {rc_path}")
    pm = urllib.request.HTTPPasswordMgrWithDefaultRealm()
    pm.add_password(None, "https://urs.earthdata.nasa.gov", auth[0], auth[2])
    return urllib.request.build_opener(urllib.request.HTTPBasicAuthHandler(pm),
                                       urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def fetch_granule(op, gid: str):
    ce = ";".join([f"/Grid/{v}[0][{LON[0]}:{LON[1]}][{LAT[0]}:{LAT[1]}]" for v in VARS] +
                  ["/Grid/time", f"/Grid/lat[{LAT[0]}:{LAT[1]}]", f"/Grid/lon[{LON[0]}:{LON[1]}]"])
    url = (f"https://opendap.earthdata.nasa.gov/collections/{COLLECTION}/granules/GPM_3IMERGM.07%3A{gid}.dap.csv"
           f"?dap4.ce={urllib.parse.quote(ce)}")
    for attempt in range(4):
        try:
            text = op.open(url, timeout=120).read().decode()
            break
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
    nlon, nlat = LON[1] - LON[0] + 1, LAT[1] - LAT[0] + 1
    out = {v: np.full((nlon, nlat), np.nan, dtype="<f4") for v in VARS}
    meta = {}
    for line in text.splitlines():
        head, _, rest = line.partition(", ")
        if not head.startswith("/Grid/"):
            continue
        name = head[6:].split("[")[0]
        if name in ("time", "lat", "lon"):
            meta[name] = [float(x) for x in rest.split(", ")]
        elif name in out:
            i = int(head.split("][")[1].rstrip("]"))
            out[name][i] = np.array(rest.split(", "), dtype="<f4")
    return gid, out, meta


def main():
    ids = [e["producer_granule_id"] for e in json.load(urllib.request.urlopen(CMR, timeout=60))["feed"]["entry"]]
    print(f"{len(ids)} granules listed by CMR")
    op = opener()
    results = {}
    with cf.ThreadPoolExecutor(5) as ex:
        for gid, data, meta in ex.map(lambda g: fetch_granule(op, g), ids):
            results[gid] = (data, meta)
            print(".", end="", flush=True)
    print()
    first = results[ids[0]][1]
    header = {"format": "geoorchestra-imerg-subset-v1", "created": dt.datetime.now(dt.timezone.utc).isoformat(),
              "source": f"NASA GES DISC GPM_3IMERGM V07B via Earthdata Cloud OPeNDAP (opendap.earthdata.nasa.gov, collection {COLLECTION})",
              "granules": ids, "times": [int(results[g][1]["time"][0]) for g in ids], "lat": first["lat"], "lon": first["lon"],
              "lonIndex": list(LON), "latIndex": list(LAT), "vars": VARS, "layout": "[granule][var][lon][lat] float32 little-endian", "dmr": ""}
    hb = json.dumps(header).encode()
    body = np.stack([np.stack([results[g][0][v] for v in VARS]) for g in ids]).astype("<f4").tobytes()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUT, "wb") as f:
        f.write(struct.pack("<I", len(hb)) + hb + body)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
