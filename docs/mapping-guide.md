# Mapping guide (version `rain-v1`)

Sound is a **designed mapping** of satellite estimates. It is not a recording. The mapping is fixed across dates and regions, so a higher note always means more rainfall.

| Data | Musical sonification | Geophony | Visual |
| --- | --- | --- | --- |
| Precipitation rate (mm/hr, monthly mean) | Pitch on the chosen scale (default C pentatonic, C3–C6) and velocity | Drop density, rain-bed loudness and brightness | Map colour / graph height |
| Change from the previous **valid** month | Note density: +1 note per 0.08 mm/hr, up to 4 per step | Extra agitation | Slope in graph |
| Longitude of 5 sampled cells (Puerto Princesa, Manila, Iloilo, Cebu, Davao) | Stereo pan, west → left (spatial-phrase preset) | — | Purple dots on map |
| Year boundary | Soft high tick | — | Marker lane |
| **Zero** rainfall (measured) | Lowest note plus a bright "zero" tick | Quietest rain | Real 0 in table |
| **Missing** | No note, a muted thud, red gap | Rain fades to silence | "missing", never 0 |

- **Reference range:** 0–1.5 mm/hr on a square-root curve. Values above it are clipped and flagged `clipped`, and the raw value is kept on the event.
- **No change across gaps:** density is never computed across a missing month.
- **Timbre only:** changing the instrument, scale, pitch range or volume changes how events sound, never the measurements. Events are regenerated deterministically.
- **Area vs cell:** the event inspector states whether a note came from an area mean (cos-latitude weighted, valid cells inside a Natural Earth outline, with coverage) or from a single 0.1° cell.

The visual feed uses the same mapping on the reconstructed seasonal climatology (one step per seasonal day).
