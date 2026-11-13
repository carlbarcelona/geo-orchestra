# GeoOrchestra development plan

Four person team · Proposed 14 day MVP schedule · Prepared 14 November 2026

Build the numerical workspace in Pictures 1 and 2 first, then build the visual feed workspace in Pictures 3 and 4 around the same measurements, sound engine, project state, and playback controller. Both workspaces belong to one application. A change to the selected region, mapping, or volume should behave consistently wherever the user makes it.

This plan develops the scope in the [Final Project Brief](https://docs.google.com/document/d/1VHn-yGB47wGDFwZxDXvmev2TfX0q3r9_tBNo7qOt0VU/edit?tab=t.hf0yseiwznrn) and the four supplied interface concepts. Tasks, ownership, checkpoints, and acceptance targets below are recommendations. They are not claims that these features have already been implemented. The original proposal and existing demo files remain unchanged.

The schedule assumes all four members can contribute on each project day, the two developers are available for substantial coding time, and dataset access can be established promptly. These are working days counted from kickoff, not an assumed calendar deadline. If availability is lower, retain the sequence and extend the dates. Do not compress verification to preserve an estimate.

## Team responsibilities

| Person | Main responsibility | Concrete ownership |
| --- | --- | --- |
| You, team lead | Scope, scientific decisions, integration acceptance, and resolving blockers | Approve data meaning and sound mappings; prioritize issues; verify phase demonstrations; maintain the decision log; prepare the explanation and demonstration. Take focused coding or debugging tasks when they unblock the developers. |
| UI/UX designer | Complete workflows and interaction design | Numerical and visual feed layouts; component specifications; loading, empty, error, and ready states; keyboard behavior; responsive layouts; usability checks and visual review. Coding is not assumed. |
| Developer A | Data and geographic/media processing | NASA ingestion, preprocessing, quality handling, regional selection and aggregation, map assets, visual media manifests, climatology alignment, and data verification. Also implement the geographic and media components that consume these outputs. |
| Developer B | Application behavior and sound | Application shell, shared state, numerical input screens, playback controller, sound engine, piano roll, project saving, and deployment setup. Own integration of the components supplied by Developer A. |

These are ownership areas, not exclusive permissions. Developer A supplies working map and media components rather than leaving all frontend implementation to Developer B. You resolve cross-cutting choices, but routine coding choices remain with the responsible developer. The designer stays one phase ahead and reviews the implemented experience throughout.

## Scope and architecture to agree at kickoff

The 14 day target is precipitation for the Philippines, both essential listening modes, inspectable scientific values, a rolling piano roll, historical playback, and an authentic NASA visual feed with verified measurement alignment. The historical target remains June 2000 through December 2024: 295 monthly observations. Start with a verified 24 month subset, as the brief permits, and expand through the same pipeline.

Use the brief's React and TypeScript frontend, Python and Xarray preprocessing, and static data/assets. Choose Tone.js over Web Audio as the musical scheduling layer if the Day 1 audio check succeeds; use it consistently. Start with a projected rainfall raster and a lightweight geographic overlay. Add MapLibre only if the team already has a working implementation or the simple renderer cannot support selection. A backend is a response to a demonstrated requirement, not a starting dependency.

Provide two entry paths into one processing chain:

**Numerical:** NASA sample or supported processed input → validate → select location/region → derive events → play sound and show values, map, graph, and piano roll.

**Visual feed:** NASA media plus its manifest → resolve frame time and geographic selection → connect compatible measurements → use the same event and sound pipeline.

There is one important source distinction. SVS 5478 represents 2001–2022 daily precipitation climatology with a trailing 30 day average. Its average seasonal conditions cannot be paired with individual historical monthly values as though they described the same observations. Matching measurements are an explicit dependency. [NASA source description](https://svs.gsfc.nasa.gov/5478/)

The first numerical input release supports the bundled authentic NASA sample and the application's documented processed JSON format. “NASA sample” loads prepared data; it does not require a visitor to download a global archive. Decide on Day 1 whether CSV import is essential. Raw NetCDF/HDF processing stays in the preparation pipeline. An arbitrary spreadsheet editor, broad NASA search service, and arbitrary video analysis would each be additional scope.

## Phase 0 Establish the contracts and prove the risky parts

**Day 1.** Set up the application and prove that the two workspaces can share its foundations.

Developer A acquires one authentic monthly IMERG file or a documented regional export, checks its dimensions, time coordinate, units, fill values, and available quality fields, and produces one small readable sample. The precipitation field is a rate in mm/hr; retain that unit throughout the initial build. [Dataset band documentation](https://developers.google.com/earth-engine/datasets/catalog/NASA_GPM_L3_IMERG_MONTHLY_V07)

In parallel, Developer A checks access to the NASA visual asset, its timestamp list, and a viable route to matching climatological measurements. Set an early feasibility status: available, obtainable with identified work, or unresolved. A video download alone does not satisfy the numerical dependency.

Developer B creates the application shell, Numerical and Visual feed tabs, a shared state container, and a temporary screen that plays a short note after an explicit user action. Establish a single playback controller immediately, even before the full sound engine exists. Set up a preview deployment so integration is visible from the start.

The designer specifies the first numerical journey: empty workspace → sample loading → valid data → region selected → playback → inspect event. Include malformed input, partial data, and unavailable audio states. You approve the initial demonstration region, supported input format, mapping defaults, and scope boundaries.

Agree four small, versioned contracts:

| Contract | Required information |
| --- | --- |
| Dataset manifest | Dataset ID and version, variable, unit, cadence, coverage, geographic extent, source/attribution, preparation method, and asset paths. |
| Observation and selection | Stable ID; UTC interval; latitude/longitude or region geometry reference; original value; quality status; cell or area selection type; aggregation method; valid coverage. Retain the brief's region and derived x/y fields where applicable. |
| Sound event | Event ID; source observation IDs; dataset and selection IDs; original values/units; event offset/duration; note or texture parameters; mapping version. |
| Visual media manifest | Asset identity; projection and bounds; frame index and presentation time; seasonal date or historical time; averaging period/smoothing; measurement linkage and alignment status. |

Keep normalized sound values separate from original measurements. Region-derived events must identify their aggregation and contributing observations. Pixel coordinates remain derived display positions.

**Checkpoint:** an authentic sample passes from preparation into the application; a user action starts audio; both developers can work against the agreed contracts. Record the visual alignment risk and its next action.

## Phase 1 Build numerical ingestion and trustworthy data states

**Days 2–3. Pictures 1 and 2 begin to function.**

Developer A builds a repeatable preparation command that selects the Philippine extent, orders monthly records, handles missing and invalid values, and exports the initial verified 24 month package. Preserve source metadata and native quality information; distinguish it from application-derived availability labels. Validate coordinates, units, duplicate keys, date coverage, and output counts. Begin preparing the remaining archive in the background.

Define the first geographic selections: a named Philippine region and a selectable grid cell. For area means, specify the boundary, whether ocean cells are included, area weighting, and the coverage rule. Exclude invalid cells and expose the valid coverage; do not imply a fully observed region when much of it is missing. Keep one source value available for a direct comparison against the processed output.

Developer B implements the Data panel and loader: NASA sample, processed file input, explicit synthetic demo, progress, validation summary, retry, and removal/replacement of a dataset. Build the table with real records, units, quality/availability, record count, search, and basic filtering. A failed replacement must not leave old audio playing against new labels.

The designer reviews these states in the actual application and specifies the graph/map views next. You inspect a few source-to-output values, approve the aggregation rule, and confirm that synthetic data is visibly separate from NASA data.

**Checkpoint:** importing valid data produces inspectable records; malformed input explains its problem; missing data remains missing; the application can run the prepared sample without a live NASA connection. Aim for a thin demonstration of one record producing one explainable note by the end of Day 3.

## Phase 2 Complete numerical exploration and the shared timeline

**Days 4–5.** Make the numerical workspace useful before adding sound complexity.

Developer A implements the geographic component: rainfall raster, bounds/projection handling, coordinate lookup, one selected cell, and the named region. Generate or load regional summaries using the approved aggregation rule. If a country outline is shown, the aggregation must use its documented mask; a rectangular selection must be labeled as a bounding box. Provide the historical map assets through the same dated manifest as the measurements.

Developer B connects the Table, Map, and Graph views to one selected dataset, region, and historical range. Implement the precipitation time series, selected observation readout, source metadata, pins/regions list, and clear cell-versus-area labels. Basic search/filter/column controls should work or be removed from the release layout.

Implement play/pause, previous/next observation, range selection, scrub, loop, and a small set of speed options. Observation time and playback seconds are distinct axes. At one month per second, the full target occupies approximately 295 seconds, allowing one second per monthly observation. Display the coverage actually loaded, including when only the starter subset is available.

The designer checks selected, hover, focus, and disabled states and plans the sound controls. You verify that changing views preserves the selection and that selecting a time updates the map, table highlight, graph cursor, and scientific readout together.

**Checkpoint:** a user can select a Philippine location, inspect its monthly values across all three views, and navigate the range with one consistent timeline. No audio component owns a separate date counter.

## Phase 3 Finish the numerical listening experience

**Days 6–7.** Deliver a complete first workstream before expanding the visual workspace.

Developer A supplies deterministic event generation from the selected observations and a separate geophony parameter module. Developer B integrates the musical instruments, sound scheduling, controls, and piano roll. Keep those modules separate enough that both developers can contribute without editing the same engine file.

Implement the baseline mapping first: rainfall controls pitch and dynamics on a fixed scale; change between valid successive observations can control note density; longitude controls stereo placement when spatial samples are played. Add short phrases from a small, stable set of spatial samples after a single regional melody works. Distinguish sampled cell notes from an area-mean melody in event details. Latitude/register and region/instrument mappings belong in named presets with explicit precedence, rather than silently competing with rainfall for pitch.

Choose a fixed reference range for a mapping version and keep it stable across date and region comparisons. Record any clipping or transformation and preserve the raw value. Missing observations create a visible gap and an identifiable missing-data status, not an invented zero or interpolated rainfall measurement. Do not calculate change across a gap without a stated rule. Zero rainfall and missing rainfall must remain distinguishable.

For geophony, map rainfall to drop density, texture, and intensity. Reuse suitable ideas or attributed assets from the existing sound demo, but replace its twelve illustrative daily inputs and fixed demo assumptions. Its mm/day practice values must not be connected directly to the new mm/hr observations. A short synthesized instrument and one alternate timbre are sufficient initially; judge them through the same mapping.

Use the audio clock to schedule events and derive visual positions. Tone's transport provides shared timing and scheduled event timestamps; UI updates must respect the scheduled time rather than display look-ahead callbacks early. Scrubbing, region changes, speed changes, and mode changes must cancel obsolete events. Pause playback when the page is hidden for the MVP and resume only when requested. [Tone.js transport documentation](https://github.com/Tonejs/Tone.js/wiki/Transport)

The piano roll renders the generated event list and exposes accessible event details: date, location or aggregation, original precipitation, units, note/texture, and mapping. The audio legend auditions low, middle, high, zero, and missing cases without unexpectedly mixing with playback. Implement volume and separate layer levels where relevant.

Developer B adds local project saving and reopening: dataset references, selection, range, speed, mappings, and display preferences. Use a versioned project file, not an account system. Explain that external media or user files may need to be supplied again; do not imply that saving settings bundles those assets.

**Checkpoint:** the numerical workflow runs from import through both essential listening modes and event inspection. A change of instrument preserves the measurements. Save and reopen restores the intended settings. This is the first complete demonstration milestone.

## Phase 4 Build the visual feed interface and media handling

**Days 8–9. Pictures 3 and 4 become the second workstream.**

Developer A packages a chosen authentic NASA visual asset with its colorbar, credits, projection/bounds, and frame-time manifest. Preserve the original asset and record any resized derivatives. Prefer a manageable frame sequence for deterministic seeking; use video only after verifying decoding, seek behavior, and its mapping to presentation time. Preload a small window of frames rather than the entire high-resolution collection.

Developer B builds the curated NASA catalogue, Project list, source details, import action, source link, Frame/Timelapse controls, fit/fullscreen behavior, region selection, and shared Sound Studio. Catalogue search covers the bundled entries; a broad NASA discovery service is outside this release. Switch tabs using the same project and sound controls.

Implement distinct states: no media; loading/error; media ready without linked measurements; incompatible measurements; and aligned playback ready. Picture 4 is a real operating state. Until linkage succeeds, disable measurement-derived graphs and audio events and explain what is missing. An experimental image-features option is deferred and must not produce rainfall measurements from colors.

The designer checks the two timeline meanings: historical year/month and seasonal month/day. You confirm the source identity and the wording that distinguishes NASA imagery from maps rendered by the team.

**Checkpoint:** authentic NASA media displays with correct attribution and an inspectable frame time. Region selection is geographically meaningful, and disconnected media cannot imply verified numerical playback.

## Phase 5 Connect the visual feed to compatible measurements

**Days 10–11, dependent on the source work begun on Day 1.**

Developer A delivers the matching climatology measurements or a documented reconstruction using compatible source data and an established processing recipe. Verify product/version, averaging years, seasonal date convention, smoothing, units, projection, and selection geometry. Do not label a reconstruction exact if the necessary recipe cannot be established. Obtain it or retain an explicit unresolved alignment status.

The source's timestamp list repeats some seasonal dates. Therefore frame number is not a unique calendar day. Map the selected frame set explicitly to the supplied list; confirm counts, first/last entries, and ordering rather than dividing the frame index by an assumed rate. Repeated visual dates should not accidentally create duplicate measurement events. [NASA timestamp list](https://svs.gsfc.nasa.gov/vis/a000000/a005400/a005478/IMERGclim_dates2.txt)

Developer B connects frame position, graph cursor, original values, sound events, and piano-roll highlighting to the shared controller. Keep separate timeline adapters for monthly history and seasonal media. Reuse rendering and sound modules, while preserving each dataset's time meaning. Define the alignment indicator and event inspector so users can see what supports the linkage.

On a seek, cancel scheduled sound, resolve the target frame/measurement, wait for readiness, then schedule the new events. If a required asset stalls, buffer the synchronized experience rather than allowing the audio to advance into a different observation. Ensure a single missing or failed frame does not silently reuse an old one under a new date label.

The designer tests this journey: import → choose Philippines → inspect alignment → hear the legend → play → pause → inspect a value → switch back to numerical history. You compare several known frame/date/value combinations at the start, middle, and end and approve the alignment evidence.

**Checkpoint:** Picture 3 is an honest connected state: the visible frame and its audio correspond to compatible measurements. If matching data remains unavailable, ship the authentic media viewer with linkage disabled and the historical numerical explorer intact. Record EIC measurement synchronization as incomplete; this fallback does not satisfy the full synchronized experience. Resume this phase when verified inputs are available and re-estimate its remaining work.

## Phase 6 Verify accessibility science and playback

**Day 12, with basic accessibility already implemented throughout.**

Developer A completes or audits the full historical package and verifies the expected 295 month keys, order, geographic coverage, quality treatment, and provenance. If the full package is not ready, retain the verified 24 month release and disclose the actual coverage. Check valid month lengths and temporal metadata; any later conversion to accumulated mm requires a documented calculation and treatment of missing coverage.

Developer B fixes playback lifecycle problems, loading failures, performance bottlenecks, project restoration, and keyboard interactions. The designer leads keyboard and screen-reader walkthroughs and checks contrast, focus order, readable numbers, reduced motion, responsive panel order, and alternatives to dense visual charts. A map must have a location selector alternative. Announce user actions and meaningful status changes without reading every rapidly changing frame aloud.

Use focused automated checks for the risky transformations: missing versus zero, aggregation and coverage, fixed normalization, deterministic mapping, frame/date matching, and cancellation after seeking. Run real browser checks for the complete flows rather than relying only on isolated functions.

You lead acceptance sessions. Ask a person unfamiliar with the interface to locate a region, compare a wetter and drier period, explain a sound using the legend, and inspect the original value. Record participant feedback accurately. Without blind or low-vision participants, report the accessibility checks performed and the remaining validation limit.

Proposed engineering acceptance targets, to be agreed on Day 1, are:

- Numerical readout, cursor, map, and sound event reference the same observation at every sampled checkpoint.
- In active foreground playback, a visual highlight follows scheduled audio within 100 ms on the declared demonstration devices. This is a project target, not an established research standard. Verify instrumented timing and an audible/visible test; disclose failures rather than claiming perceptual accuracy from internal logs alone.
- The complete loaded range plays without accumulating a one-observation offset. Exercise the full approximately five-minute target when the 295 month package is ready.
- Repeated play/pause, looping, seeking, speed changes, tab switching, and region replacement do not leave stale or doubled sounds.
- The core journey is usable with a keyboard, and measurements remain readable when audio is unavailable.
- A failed or incompatible input cannot be mistaken for a ready, aligned project.

**Checkpoint:** remaining defects are classified by effect. Incorrect values, false alignment, inaccessible core actions, and broken playback block release. Cosmetic refinements do not displace those fixes.

## Phase 7 Release document and demonstrate

**Days 13–14.** Freeze new features and finish the demonstrable project.

Developer B produces the release deployment, verifies asset paths in the hosted build, and prepares a local served fallback. Developer A packages datasets, preprocessing instructions, validation results, source and asset credits, known limitations, and alignment evidence. The designer verifies the actual deployed screens and supplies the final demonstration visuals.

You prepare a short explanation anchored in one traceable interaction: select a Philippine region → inspect authentic rainfall → hear Musical Sonification → switch to Geophony → inspect the event that made a sound → open the NASA visual experience and explain its seasonal time basis. Rehearse from a fresh browser, including the initial audio activation and source loading. Prepare a clearly identified recording or screenshots for presentation failure, without presenting them as live playback.

Final deliverables are the working application, source repository, repeatable data preparation process, versioned sample/archive packages, source attribution, mapping guide, accessibility notes, verification record, known limitations, and demonstration script. Include setup and run instructions that another teammate can follow.

**Release decision:** you accept each required behavior based on its demonstrated state. Keep full-target delivery, the allowed historical subset fallback, unresolved EIC synchronization, and optional enhancements visibly distinct in the release notes.

## How the fourteen days fit together

| Days | Main output | Developer A | Developer B | Designer and lead |
| --- | --- | --- | --- | --- |
| 1 | Contracts and feasibility | Authentic sample and visual linkage investigation | Shell, shared state, audio check, preview | Numerical journey, scope and source decisions |
| 2–3 | Numerical input | Verified subset and processing pipeline | Loader, validation, table, thin note demonstration | Input-state review and source spot checks |
| 4–5 | Numerical exploration | Geographic component and summaries | Graph/table integration and transport controls | Selection behavior and numerical acceptance |
| 6–7 | Numerical listening milestone | Event generation and geophony parameters | Musical engine, chart, legend, save/reopen | Mapping, listening and accessibility review |
| 8–9 | Visual feed interface | Media component and manifest | Catalogue, source UI, shared studio integration | Disconnected and ready state review |
| 10–11 | Verified visual synchronization | Matching measurements and alignment evidence | Frame, graph, audio and chart coordination | Scientific and workflow acceptance |
| 12 | Verification and fixes | Archive and scientific checks | Playback, accessibility and performance fixes | Usability checks and release triage |
| 13–14 | Release and demonstration | Reproducible data package and credits | Hosted release and local fallback | Final review, documentation and rehearsal |

## Working rules that protect the schedule

Hold a 15 minute daily check-in around what now works, the current blocker, and the next dependency. End each day with a short demonstration in the shared preview. A screenshot of an unfinished interface is not a completed behavior.

Give every implementation ticket one owner, a visible outcome, its input dependency, and a concrete acceptance check. For example: “After selecting the named Philippine region, the graph and inspected audio event show the same approved area-mean value for a chosen month.” Keep tasks small enough to review within about half a day where practical.

Each developer reviews the other's consequential data, timing, or integration changes. The designer reviews interaction changes. You decide unresolved scope and scientific questions and own the milestone acceptance record. Use a shared board with Ready, In progress, Review, and Accepted columns, plus a short decision log. Do not route every routine implementation decision through the lead.

Make scope decisions at the end of Days 3, 7, and 11. If blocked, cut optional work first. Preserve data integrity, both essential audio modes, inspection, keyboard access, and truthful source labels. Keep the visual source investigation running early so the second workstream does not discover its largest dependency on Day 10.

## After the required project works

The following work is deliberately outside the critical 14 day path. Hybrid is the first optional addition because it can mix two already working audio paths with independent levels. Verify it does not alter the source mapping or overload the mix.

Next, consider richer instruments, distribution graphs, broader CSV import, multiple saved pins, more flexible region drawing, more regions, and advanced mapping presets. Extend automated checks around any new aggregation or mapping behavior before broadening the dataset catalogue.

Full staff notation, VexFlow, MIDI/MusicXML/WAV export, downloadable compositions, general NASA catalogue integration, arbitrary media import, and image-feature sonification are separate enhancements. Experimental image features must be described as image-derived features; scientific precipitation retrieval would require a justified method of its own.

Sea surface temperature, wind, pollution, global-scale delivery, accounts, and collaboration come after the rainfall release. Each new variable needs its own units, quality rules, temporal alignment, reference ranges, auditory explanation, and validation. Estimate these expansions from the completed rainfall architecture rather than implying that all future scope fits inside fourteen days.
