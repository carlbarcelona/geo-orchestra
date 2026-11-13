# Accessibility notes

- **Keyboard:**
  - `Space` play/pause, `L` loop, `Left/Right` step, `Home/End`, `?`; `Esc` closes dialogs
  - all controls are native buttons, selects or ranges with labels
  - a skip link jumps to the workspace
  - focus rings are amber
- **Map alternative:** a named-region selector (Pins / Regions) and a latitude/longitude cell picker in Map view.
- **Values without audio:** the Table, the "Now" readout and Event details give every value with its unit, availability, random error and coverage.
- **Screen readers:** a polite live region announces actions and status changes, such as play, pause, buffering, loading, selection, linkage and end of range. It does not read every frame during playback. Stepping announcements are optional (Accessibility dialog).
- **Display options:** Reduced motion (the piano roll moves step by step; this follows `prefers-reduced-motion` by default), High contrast, and Larger text.
- **Audio:**
  - the Audio legend auditions each case and pauses playback first
  - melody, rain-texture and marker layers have independent levels
- **Not yet done:** validation with blind or low-vision participants, and a full screen-reader pass on each platform (NVDA, VoiceOver).

## Hearing and reading what a frame shows

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
