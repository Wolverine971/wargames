# Map Progressive UI Spec

Date: April 4, 2026

Companion to:

- [/Users/djwayne/wargames/docs/map-suite-implementation-plan.md](/Users/djwayne/wargames/docs/map-suite-implementation-plan.md)
- [/Users/djwayne/wargames/docs/map-feature-suite.md](/Users/djwayne/wargames/docs/map-feature-suite.md)

## Goal

Define a tool system that is powerful, intuitive, and visually restrained.

The interface should never feel like a GIS control graveyard. The map remains the primary surface. Tools should expand only when needed and collapse when the task is done.

## Design Principles

1. Show the next action, not every action.
2. Keep the map visible while tools are active.
3. Open detail only in response to intent.
4. Make advanced controls discoverable but not default-visible.
5. Let AI operate as a guide and accelerator, not a hidden second UI.

## UI Layers

The workspace should use five levels of disclosure.

## Level 1: Persistent Shell

Always visible:

- compact top action bar
- compact left rail
- bottom operational ribbon

Never place full forms here.

## Level 2: Active Tool Tray

When the user clicks a tool in the top bar, open a compact floating tray near the top-left of the map.

Properties:

- only one tray can be open
- tray width stays constrained
- tray contains only controls relevant to the active tool
- tray closes on tool completion, cancel, or `Escape`

This is the main progressive-disclosure surface.

## Level 3: Advanced Options

Within the tool tray, advanced options stay behind:

- accordions
- segmented submodes
- `More options` toggles

Examples:

- route profile
- optimization mode
- custom ring styling
- import options

These should not be open by default.

## Level 4: Selection Inspector

When a feature is selected, the right inspector opens or updates.

It should show:

- name
- type
- layer
- group
- exact measurements
- style options
- contextual actions

The inspector is not the place to arm tools. It is the place to inspect and edit the currently selected result.

## Level 5: Modal Dialogs

Use modals only for:

- destructive confirmation
- import/export flows
- save-as or duplicate flows
- large AI plan previews

Do not use modals for routine tool operation.

## Primary Layout Model

### Top Action Bar

Buttons:

- `Select`
- `Point`
- `Group`
- `Ring`
- `Route`
- `Area`
- `Measure`
- `Annotate`
- `Search`
- `AI`

Behavior:

- clicking a tool activates it and opens its tray
- clicking the same tool again closes its tray and returns to `Select`
- switching tools closes the prior tray first

### Left Rail

Collapsed by default to preserve map space, expandable on demand.

Sections:

- `Layers`
- `Groups`
- `Analysis`
- `Views`

Only one left-rail section should be expanded at a time.

### Right Inspector

Hidden until there is a selection.

When nothing is selected, it should stay collapsed or show a very small hint state.

### Bottom Ribbon

Always small, always informational:

- cursor coordinates
- grid reference
- active unit mode
- selection summary

It should never become a form surface.

## Tool Behavior Spec

Each tool follows the same lifecycle:

1. `Idle`
2. `Armed`
3. `Previewing`
4. `Committed`
5. `Selected`

### Idle

No tool tray is open. Selection is allowed.

### Armed

The user chooses a tool and sees its basic options.

### Previewing

Map hover or click shows a ghost preview before commit.

Examples:

- point ghost marker
- ring ghost circle
- route ghost segment

### Committed

The object is created and becomes selectable.

### Selected

The right inspector shows details and editing controls.

## Tool Specs

## Point Tool

Default tray content:

- label
- layer picker
- group picker
- point type or icon

Map behavior:

- first click places the point
- point becomes selected after placement
- tray stays open only if the user enables repeat placement

Advanced options:

- coordinate entry
- MGRS entry
- snapping

## Group Tool

Default tray content:

- selected object count
- `Create group`
- `Assign to existing`

Map behavior:

- no direct map click required
- acts on current selection

Advanced options:

- group color
- visibility default
- lock group

## Ring Tool

Default tray content:

- preset chips: `1 mi`, `5 mi`, `10 mi`, `25 km`
- unit toggle
- radius or diameter toggle

Map behavior:

- click anchor point
- immediate preview of default ring
- commit on click or confirm

Advanced options:

- custom value
- multiple rings
- fill or outline
- dashed style
- points-inside query

This tool should be one of the fastest interactions in the product.

## Route Tool

Default tray content:

- mode: `Straight` or `Road`
- add waypoint instructions
- clear route

Map behavior:

- each click adds a waypoint
- live preview updates after every click
- double-click or confirm ends route creation

Advanced options:

- reorder waypoints
- route optimization
- alternatives
- labels and styling

## Measure Tool

Default tray content:

- mode: `Distance`, `Area`, `Bearing`

Map behavior:

- quick disposable measurement by default
- option to save as object

Advanced options:

- persistent measurement
- segment breakdown
- comparison mode

## Search Tool

Default tray content:

- search field
- recent searches
- coordinates input shortcut

Map behavior:

- selecting a result moves the map
- optional `Create point from result` action appears after selection

## Annotate Tool

Default tray content:

- annotation type
- color
- layer

Map behavior:

- click to place annotation
- inspector handles text edits after placement

## AI Tool

The AI surface should be compact by default.

Default tray content:

- command input
- recent suggested commands
- example prompts

Example prompts:

- `Create a point called Alpha at these coordinates`
- `Draw a 10 mile ring around the selected point`
- `Group these markers as Route Package A`
- `Build a road route through the selected points`

AI behavior rules:

1. Convert prompts into structured actions.
2. Show a preview before commit.
3. Explain ambiguous interpretations.
4. Use existing tool panels and inspector states whenever possible.
5. Never apply destructive actions without confirmation.

## Progressive Disclosure Patterns

### Pattern 1: Quick-to-Deep

The tray starts with only the most likely controls.

Example:

- ring presets first
- custom numeric input second
- styling last

### Pattern 2: Selection-Driven Detail

Do not ask the user to define every option before placement.

Instead:

- place quickly
- select the created object
- refine in the inspector

### Pattern 3: Repeatable Mode

Some tools should allow a `Repeat` toggle.

Example:

- place multiple points without reopening the tool
- create several rings in succession

### Pattern 4: Soft Guidance

When a tool is armed, show a single short instruction near the tray or map cursor.

Good:

- `Click the map to place the point`
- `Select an anchor point for the ring`

Bad:

- dense paragraphs
- multi-step tutorials blocking the map

## Responsive Behavior

### Desktop

- left rail collapsed to icons until opened
- tool tray floats over the map
- right inspector docks to the side

### Narrow Screens

- left rail becomes a bottom sheet or slide-over
- tool tray becomes a top sheet
- inspector becomes a slide-over

The system should preserve the same disclosure hierarchy even if placement changes.

## Accessibility and Keyboard

Must support:

- full keyboard navigation for the top bar
- `Escape` to close tool tray
- `Enter` to confirm when meaningful
- visible focus states
- screen-readable labels for all tool actions

Recommended shortcuts:

- `V` select
- `P` point
- `G` group
- `R` ring
- `T` route
- `M` measure
- `/` search
- `A` AI

## Visual Restraint Rules

1. Avoid more than one major floating panel per side at once.
2. Keep inactive controls collapsed.
3. Use chips, segmented controls, and short labels before large forms.
4. Reserve dense forms for import, export, and advanced settings.
5. Make the map the largest visual element at all times.

## First UI Slice To Build

The first implementation of this model should include:

- top action bar
- single active tool tray
- right inspector
- ring tool with presets
- unit toggle
- point and group flows

If those are clean, the rest of the suite can expand without the interface turning noisy.
