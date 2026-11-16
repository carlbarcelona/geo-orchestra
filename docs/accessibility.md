# Accessibility notes

- **Keyboard:**
  - `Space` play/pause, `L` loop, `Left/Right` step, `Home/End`, `?`; `Esc` closes dialogs
  - all controls are native buttons, selects or ranges with labels
  - a skip link jumps to the workspace
  - focus rings are amber
- **Map alternative:** a named-region selector (Pins / Regions) and a latitude/longitude cell picker in Map view.
- **Values without audio:** the Table, the "Now" readout and Event details give every value with its unit, availability, random error and coverage.
- **Screen readers:** a polite live region announces actions and status changes, such as play, pause, buffering, loading, selection, linkage and end of range. It does not read every frame during playback. Stepping announcements are optional (Accessibility dialog).
- **Preset mode (default):** fewer controls, one-click start, region buttons, a "What you hear" guide and listening presets. Advanced shows everything. The switch is a labelled button group at the right of the workspace tabs.
- **Captions:** a "Now hearing" strip states the value, how it compares with normal and what the sounds mean. It is not a live region (to avoid chatter); the same text is announced on pause and step.
- **Narration (opt-in):** Accessibility → "Speak summaries aloud" uses the browser's speech engine on pause and step, and during playback only for unusual months and rain-band turns. It may overlap a screen reader, so it is off by default.
- **Time cues and checkpoints:** a knock marks each new year (Numerical) or month (Visual feed) in both sound modes, so the passing of time can be followed by ear.
  - `C` adds or removes a checkpoint at the current step, and each change is announced.
  - The checkpoint list in Advanced has labelled inputs and jump and remove buttons.
  - Checkpoint labels appear in the caption and are spoken during playback when narration is on.
- **Session briefing (before the music):** a spoken introduction names each sound that will play, plays an example of it, and says what "higher", "louder" and "more" mean.
  - A modal shows the sentence being read and highlights each word as the voice reaches it; read words stay bright. "Read the whole briefing" lists every part as text.
  - It is built from the live settings, so it never describes a sound that is off or muted. It always says that missing is not zero and that the sounds are not recordings.
  - Preset mode: opens automatically before the first playback in each workspace, and again when the sounds change (another listening preset or sound mode). Skip briefing continues pending playback; it does not permanently disable future briefings. Esc still pauses, and a part can be replayed.
  - Advanced mode: on by default; Skip briefing (or Esc), and a switch in the modal or the Accessibility dialog turns it off.
  - Without a browser voice, or with a voice that reports no word positions, the words advance on a timer so the highlight still paces the briefing.
  - "Replay briefing" under the Audio legend button hears it again at any time.
  - Skipping a manually replayed briefing closes it without starting playback. Both modes place Skip briefing at the right of the modal's control row, including while paused.
- **Resizable panels:** drag the gaps between panels, or the music chart's top edge. Each handle is focusable: arrows move 16 px (Shift 64), Home/End go to the limits, Enter or a double-click resets. Sizes are clamped so controls stay readable, and narrow panels stack each label above its control. "Reset layout" in the status bar restores the defaults.
- **Colour is never the only cue:** wetter and drier notes also carry ▲ / ▼, and the caption says it in words.
- **Display options:** Reduced motion (the piano roll moves step by step; this follows `prefers-reduced-motion` by default), High contrast, and Larger text.
- **Audio:**
  - the Audio legend auditions each case and pauses playback first
  - melody, rain-texture and marker layers have independent levels
- **Not yet done:** validation with blind or low-vision participants, and a full screen-reader pass on each platform (NVDA, VoiceOver).

## Hearing and reading what a frame shows

- **Region of interest without a pointer:** the ROI bar's quick picks and its four labelled number fields (West, East, South, North, in degrees) set the region from the keyboard; Apply or Enter confirms it. Invalid input is reported in an alert next to the fields. Every change is announced, and the caption names the ROI voice's value.
- **Sweep (S key, or the "Sweep frame" button):** the frame is played west → east in the Hubble style (see mapping-guide.md). A gold line moves across the image and the Frame score at the same time.
- **Explore (audio cursor):**
  - Focus the frame (Tab), then use the arrow keys to move a 1° cursor; Shift moves 5°.
  - Each move plays that cell's tone and announces the location, mm/day, an intensity word, and "image-derived".
  - Dragging a finger or pointer over the frame does the same.
- **Haptics:** Android browsers vibrate in proportion to the rain under the cursor. iPhone Safari does not support web vibration.
- **Describe tab:** a plain-language description of each frame:
  - where the heaviest rain band is and whether it is moving north or south
  - how much of the view has heavy rain
  - how today ranks against the rest of the year
  - the linked measurement

  It is announced on pause and step, and every N days during playback (Accessibility dialog: 7/15/30 days or never).
- **Braille charts:** three 40-cell bar charts written in Unicode braille dots (2 bars × 4 heights per cell), each with a pointer line for "today" and a text summary:
  - this frame's west→east rain profile
  - Philippine rain over the year
  - rain-band latitude over the year

  The Numerical sound panel has one for the selected series.

### Braille caveat (must be verified with hardware)
Unicode braille (U+2800–28FF) is shown as raw dots by NVDA and JAWS when "show Unicode braille" handling is available. VoiceOver *speech* reads the characters as "braille pattern dots-…". That is why the charts sit behind a toggle (Accessibility → Braille charts) and every chart also has a text summary. **This has not been tested on a refreshable braille display.**

To check with NVDA: enable the Braille Viewer (NVDA menu → Tools), focus a chart, and confirm that the dots appear as bars.
