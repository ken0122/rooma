---
name: ROOMA
description: 以建筑线稿清晰度驱动的轻量三维室内布局工作台
colors:
  drafting-blue: "#2436d8"
  scene-blue-ink: "#2549d8"
  drafting-blue-soft: "#eef0ff"
  drafting-red: "#df4053"
  drafting-red-soft: "#fff0f2"
  drafting-green: "#2f8763"
  drafting-green-soft: "#edf7f2"
  graphite: "#555b61"
  graphite-soft: "#f0f0ed"
  ink: "#151729"
  muted: "#777b90"
  line: "#e7e8ef"
  paper: "#ffffff"
  canvas-blue: "#f6f7fb"
  canvas-red: "#fff8f8"
  canvas-green: "#f7fbf8"
  canvas-mono: "#f7f7f4"
  success: "#30b980"
  warning: "#b36e38"
  danger: "#d34e62"
  focus: "#6675ef"
  axis-x: "#244be5"
  axis-y: "#168966"
  axis-z: "#c96730"
typography:
  display:
    fontFamily: '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.05em"
  headline:
    fontFamily: '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.2
  title:
    fontFamily: '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    fontSize: "9px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  compact: "7px"
  control: "10px"
  group: "12px"
  card: "13px"
  panel: "15px"
  pill: "999px"
spacing:
  hairline: "4px"
  tight: "7px"
  control: "10px"
  section: "12px"
  panel: "16px"
  edge: "22px"
components:
  button-primary:
    backgroundColor: "{colors.drafting-blue}"
    textColor: "{colors.paper}"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "0 17px"
    height: "38px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    size: "38px"
  button-icon-active:
    backgroundColor: "{colors.drafting-blue-soft}"
    textColor: "{colors.drafting-blue}"
    rounded: "{rounded.control}"
    size: "38px"
  input-metric:
    backgroundColor: "{colors.canvas-blue}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "8px"
    padding: "0 7px"
    height: "31px"
  card-asset:
    backgroundColor: "#fafafe"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "10px"
---

# Design System: ROOMA

## Overview

**Creative North Star: "The Architectural Color Study"**

ROOMA behaves like a working architectural model laid on a bright drafting surface, not like a conventional dashboard. The room remains the visual lead; compact operating controls frame it without competing with its geometry.

The system borrows SketchUp's immediate legibility through single-color edges, white object bodies, sparse same-hue fills, and stable orthographic isometric composition. Blue, red, green, and colorless treatments are complete representation modes: each mode changes the canvas atmosphere, line work, grid, measurements, control accents, and selected fills as one coordinated study.

**Key Characteristics:**

- White drafting surfaces with fine neutral separators.
- Single-color architectural edges and restrained same-hue fills.
- A full-height model canvas framed by narrow, task-specific controls.
- Dense but legible measurements, properties, and operating feedback.
- Stable 2D, orthographic isometric, and perspective representations.

## Colors

The palette is a neutral paper-and-ink foundation whose active chromatic family switches as a complete model representation rather than appearing as scattered decoration.

### Primary

- **Drafting Blue:** Default controls, model edges, measurements, active states, and architectural accents.

### Secondary

- **Drafting Red:** Alternate warm line-study mode with a coordinated pale red canvas and soft selected state.
- **Drafting Green:** Alternate natural line-study mode with a coordinated pale green canvas and soft selected state.

### Tertiary

- **Graphite:** The colorless study mode; it preserves contrast and geometry while removing chromatic emphasis.
- **Axis X / Axis Y / Axis Z:** Restricted to dimension-axis labels in the inspector so spatial coordinates remain quickly distinguishable.

### Neutral

- **Paper:** Object surfaces, rails, panels, and floating controls.
- **Ink:** Primary interface text and high-contrast account treatment.
- **Muted:** Secondary labels, metadata, and inactive controls.
- **Line:** Hairline borders, dividers, and field strokes.
- **Mode Canvases:** Near-white blue, red, green, and graphite backgrounds that tint the drafting surface without reducing line contrast.

### Named Rules

**The Whole-Study Rule.** A color mode changes the canvas, line work, grid, measurements, active controls, and sparse fills together.

**The Paper Majority Rule.** White and near-white surfaces occupy most of the interface; saturated color is reserved for geometry, state, and spatial meaning.

## Typography

**Display Font:** Avenir Next (with system CJK sans-serif fallbacks)  
**Body Font:** Avenir Next (with system CJK sans-serif fallbacks)  
**Label Font:** Avenir Next (with system CJK sans-serif fallbacks)

**Character:** A compact humanist sans-serif keeps an engineering workspace approachable. Weight and scale, rather than multiple font families, separate room facts, panel headings, controls, and micro-labels.

### Hierarchy

- **Display** (700, compact oversized numeral): Room area and the strongest spatial fact.
- **Headline** (800, panel scale): Material-library and major panel headings.
- **Title** (700, compact control scale): Project identity and primary actions.
- **Body** (400, high-density reading scale): Supporting instructions, metadata, and empty states.
- **Label** (800, tracked uppercase where used): Selection context, room type, axes, and terse operating metadata.

### Named Rules

**The Instrument Label Rule.** Small type gains clarity through weight, tabular numerals, and selective tracking; it never relies on size alone to carry hierarchy.

## Layout

The desktop shell is a full-viewport operating grid: a 64px top bar, 72px left tool rail, flexible central canvas, and 310px material catalogue. A floating 336px inspector sits over the lower-right canvas so the spatial model stays continuously visible while dimensions are edited. View and color groups are centered above the model; room metadata and performance feedback sit at opposite left corners.

At 980px, the rail, top-bar zones, catalogue, and inspector contract. At 760px, the shell becomes a 54px rail plus canvas beneath a 58px top bar; project metadata and secondary header actions disappear, the catalogue becomes an off-canvas 270px sheet, and the inspector becomes a bottom overlay. Color controls can scroll horizontally, while reset and performance controls are removed from the compact layout.

Spacing is deliberately dense: controls cluster on a 7–12px rhythm, panel interiors use 16px, and major canvas offsets use 18–22px. The model viewport always receives the remaining space.

## Elevation & Depth

The drafting surface is structurally flat, using borders and near-white tonal shifts for most separation. Soft cool shadows appear only on floating operating groups, lifted cards, the inspector, and strong actions; translucent white surfaces add a restrained blur where controls overlap the model. The Three.js scene itself uses soft lighting and cached shadows, but white bodies and colored edge lines remain more important than realism.

### Shadow Vocabulary

- **Control Float** (`0 8px 24px rgba(31,35,70,.08)`): View groups and reset controls above the canvas.
- **Panel Float** (`0 18px 42px rgba(31,35,70,.14)`): The editable inspector above scene content.
- **Action Lift** (`0 8px 18px rgba(36,54,216,.2)`): The primary save action.
- **Card Hover** (`0 10px 22px rgba(36,54,216,.08)`): Material cards only while hovering.

### Named Rules

**The Flat-Until-Operating Rule.** Static shell regions separate with hairlines; shadows identify controls that float, move, or respond above the model.

## Shapes

The system uses compact, gently rounded rectangles: 7–10px for fields and buttons, 11–13px for grouped controls and asset cards, and 15px for the floating inspector. Circular forms are reserved for status dots, color swatches, the avatar, and the performance pill. Borders are thin and cool; no decorative clipping competes with orthographic room geometry.

## Components

### Buttons

- **Shape:** Compact rounded rectangles for actions and square icon controls; circular only for the avatar.
- **Primary:** A solid mode-color save action with white text and a soft action shadow.
- **Hover / Focus:** Icon buttons pick up a pale active-family surface; keyboard focus uses a two-pixel visible outline with offset.
- **Disabled:** Reduced opacity and a non-interactive cursor, without introducing another color.

### Chips

- **Style:** View and color selectors live inside lightly bordered white groups; each option is a small rounded segment.
- **State:** The active view uses a solid mode color, while the active color-mode option uses the corresponding pale tint and colored text.

### Cards / Containers

- **Corner Style:** Gently rounded asset cards and a more generous floating inspector.
- **Background:** Paper or a barely tinted neutral.
- **Shadow Strategy:** Cards lift only on hover; the inspector is persistently elevated because it overlays the model.
- **Border:** One-pixel cool neutral strokes.
- **Internal Padding:** Compact 10px cards and 16px inspector padding.

### Inputs / Fields

- **Style:** Short, softly rounded numeric fields with a tinted neutral fill, thin line, tabular numerals, and a muted unit suffix.
- **Focus:** The field turns white, its border shifts toward the active family, and a visible outer focus outline appears.
- **Commit Behavior:** Enter or blur applies a value; Escape restores the prior value.

### Navigation

The 64px header carries brand, project state, undo/redo, save, and account access. A 72px vertical tool rail holds editing modes with icon-only controls, explicit active state, disabled state, separators, and title/ARIA labels. On compact screens, secondary header actions are removed and the catalogue becomes collapsible off-canvas content.

### Architectural Model Canvas

White model bodies receive single-color edge segments, sparse same-hue accent geometry, a low-opacity mode-colored grid, and matching measurement lines. 2D and isometric views use orthographic cameras; the isometric camera is staged equally across three axes and rotation is locked to preserve its architectural reading.

### Object Inspector

The floating inspector organizes selection identity, transform, dimensions, six-direction clearance, and object actions into hairline-separated sections. Axis labels carry a limited X/Y/Z color code, while all editable measurement lines in the scene follow the selected study color.

## Do's and Don'ts

### Do:

- **Do** keep the room model as the dominant full-height work surface.
- **Do** switch blue, red, green, and colorless modes as coordinated whole-interface studies.
- **Do** use white bodies, colored edges, and sparse same-hue fills to explain form before material realism.
- **Do** keep controls compact and attach dense metadata directly to the task it clarifies.
- **Do** preserve orthographic geometry and locked rotation in isometric and plan views.

### Don't:

- **Don't** scatter multiple accent families across one model study.
- **Don't** replace line-first spatial clarity with photorealistic textures or decorative gradients.
- **Don't** turn the operating surface into a card dashboard that shrinks the room canvas.
- **Don't** use persistent heavy shadows on static shell regions.
- **Don't** hide measurement units, focus visibility, or the selected state of tools and representation modes.
