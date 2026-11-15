# Processed JSON import format (`geoorchestra-processed` v1)

```json
{
  "format": "geoorchestra-processed",
  "version": 1,
  "datasetId": "my-rainfall",
  "title": "My rainfall export",
  "variable": "precipitation",
  "source": { "provider": "...", "url": "...", "citation": "..." },
  "records": [
    { "timestamp": "2024-01", "latitude": 14.65, "longitude": 120.95, "value": 0.212, "unit": "mm/hr",
      "region": "Manila", "quality_flag": "valid" }
  ]
}
```

Rules enforced on import (failures are listed, and the current dataset stays loaded):

- `timestamp` is `YYYY-MM` (UTC month). `unit` must be `mm/hr` (a monthly mean rate).
- `value` must be >= 0, or `null` for missing. `quality_flag: "missing"` also means missing.
- Duplicate location/month records are ignored, keeping the first, and a warning is shown.
- A month that is present for some locations but absent for others becomes **missing**, never 0.

Each distinct latitude/longitude becomes a selectable location. See `public/data/examples/processed-example.json`, which holds the real IMERG values for the Manila cell in 2023–2024.
