# app-chrome Specification

## Purpose

Defines how the desktop app's navigation and status chrome behaves: the canvas top bar, its breadcrumbs and save status, the workspace home tiles, and the saved-canvas list. Every control stays visible, legible, and reachable across window widths and in both light and dark themes.

## Requirements

### Requirement: Unclipped list hover and focus

Saved-canvas tiles SHALL show hover state with their border and background only. They SHALL NOT move or cast a shadow on hover. A tile's keyboard focus indicator SHALL be fully visible, including on tiles in the first and last rows of the grid and while the page is scrolled.

#### Scenario: Hover the first saved canvas

- **WHEN** the user hovers the first saved-canvas tile in either theme
- **THEN** the tile's full border, including its top edge and rounded corners, stays visible
- **AND** the tile does not shift position

#### Scenario: Keyboard focus at the list edge

- **WHEN** the user tabs onto a tile in the first or last row of a grid long enough to scroll the page
- **THEN** the complete focus outline around that tile is visible

### Requirement: Top bar fits narrow windows

The canvas top bar SHALL keep each button label and status label on a single line at every window width. Every top-bar action, including the save status control, SHALL stay visible and operable, with no horizontal scrolling, at window widths down to 360px. In Classic, Settings SHALL remain in the top bar; in Activity bar, Settings SHALL appear at the bottom of the left rail instead and SHALL remain visible and operable at the same widths. When the window is too narrow for text labels, actions SHALL collapse to icon buttons that keep an accessible name and a tooltip. Hidden lead content SHALL NOT leave an empty row.

#### Scenario: Top bar at 640px

- **WHEN** a canvas is open in a 640px-wide window in either preset
- **THEN** no top-bar button or status label wraps onto a second line

#### Scenario: Top bar at 420px

- **WHEN** a canvas is open in a 420px-wide window in either preset
- **THEN** the save status control is fully visible in the top bar
- **AND** the canvas gallery and open-project action are fully visible in the top bar for Classic or in the rail for Activity bar
- **AND** Settings is visible in the top bar for Classic or at the bottom of the rail for Activity bar
- **AND** the user can save unsaved edits from the top bar

#### Scenario: Collapsed action keeps its name

- **WHEN** "Open project" is shown as an icon only
- **THEN** assistive technology announces it as "Open project" and hovering it shows the same tooltip

### Requirement: Canvas identity and back navigation at every width

The top bar SHALL always show the open canvas's title, truncated when necessary. When the window is too narrow for the full breadcrumb trail, the workspace crumb SHALL collapse to a back button that keeps the workspace crumb's destination, accessible name, and tooltip. The breadcrumbs SHALL NOT be hidden entirely.

#### Scenario: Narrow window keeps the canvas name

- **WHEN** a canvas titled "Roadmap" is open in an 800px-wide window
- **THEN** "Roadmap" is visible in the top bar
- **AND** a labeled back button leads to the same place as the workspace crumb on a wide window

### Requirement: Truncated names end with an ellipsis

A breadcrumb label longer than its available space SHALL be truncated with a trailing ellipsis rather than clipped mid-character. Its full text SHALL be available as a tooltip.

#### Scenario: Long workspace name

- **WHEN** the workspace is named "Q3 launch plan with a very long workspace name" and the crumb cannot fit it
- **THEN** the crumb ends in "…"
- **AND** hovering the crumb shows the full name

### Requirement: Canvas overlays follow the theme

Text and surfaces that the canvas library draws over the canvas, including its attribution label, SHALL use the active theme's colors in both light and dark themes.

#### Scenario: Attribution in dark theme

- **WHEN** a canvas is open in the dark theme
- **THEN** the attribution label in the bottom-right corner uses dark-theme surface and text colors instead of a light grey box

### Requirement: Informative workspace tiles

Each workspace card on the branching screen SHALL show the workspace's name and the number of canvases it contains. It SHALL NOT show decorative preview art that is identical for every workspace. A workspace this build cannot read SHALL show its identifier and no canvas count. The card's back-up and delete actions SHALL sit in their own area of the card, never on top of other card content, and SHALL keep their existing accessible names and confirmation behavior.

#### Scenario: Two workspaces with different contents

- **WHEN** the home screen lists a workspace with 3 canvases and one with 0
- **THEN** the tiles read "3 canvases" and "No canvases" respectively
- **AND** neither tile shows placeholder art

#### Scenario: Tile actions do not overlap content

- **WHEN** the user views any workspace tile
- **THEN** the back-up and delete buttons do not overlap the workspace's name, count, or any other tile content

#### Scenario: Unreadable workspace

- **WHEN** the runtime lists a workspace it cannot read
- **THEN** its tile shows the workspace identifier and no canvas count

### Requirement: Workspace list reports canvas counts

The runtime's workspace list SHALL report, for each workspace, the number of canvases it contains, or null when the workspace cannot be read by this build. Listing SHALL remain read-only and SHALL NOT take the workspace lock.

#### Scenario: List after creating canvases

- **WHEN** a workspace contains two canvases and a client lists workspaces
- **THEN** that workspace's entry reports a canvas count of 2

#### Scenario: Listing an open workspace

- **WHEN** a workspace is open in another window and a client lists workspaces
- **THEN** its entry still reports its name and canvas count, and the other window keeps its lock

### Requirement: Single save status control

The canvas top bar SHALL present saving as one control that shows the current state, never a separate status label plus a disabled Save button. At rest it SHALL read "Saved" and SHALL NOT look like an enabled primary action. While a save is running it SHALL read "Saving…". When there are unsaved edits and a save can start, it SHALL be an enabled "Save now" action that saves immediately. When there are unsaved edits but a save cannot start, for example while disconnected or while another operation runs, it SHALL read "Unsaved changes" as a status rather than show a disabled action. After a save fails with edits still unsaved, it SHALL be a "Retry save" action in an error style, enabled whenever a retry can start. When a non-save operation fails with nothing unsaved, it SHALL show that failure as an error status, and the existing error banner keeps its recovery actions. The control's state SHALL be announced to assistive technology.

#### Scenario: Idle after autosave

- **WHEN** all edits have been saved
- **THEN** the top bar shows one "Saved" status and no disabled Save button

#### Scenario: Unsaved edits

- **WHEN** the user has edits that have not been saved yet
- **THEN** the control reads "Save now" and activating it saves the canvas

#### Scenario: Unsaved edits while disconnected

- **WHEN** the user has unsaved edits and the backend is disconnected
- **THEN** the control reads "Unsaved changes" and is not presented as a disabled button

#### Scenario: Failed save

- **WHEN** a save fails and the edits remain unsaved
- **THEN** the control reads "Retry save" in an error style and activating it retries the save

### Requirement: Branching workspace and canvas picker

The workspace and canvas pickers SHALL be one branching screen, not a sequence of pages. The screen SHALL show a Workspaces card in the middle of a map; the saved workspaces SHALL branch out from it, and opening a workspace SHALL unfold its canvases from that workspace's branch. Each workspace card SHALL show its name and canvas count and SHALL keep its back-up and delete actions. Each canvas card SHALL show its canvas title, open the canvas when activated, and keep a delete action with inline confirmation and accessible names. The map SHALL support panning and zooming, and SHALL offer zoom and fit controls with accessible names. A create-workspace row SHALL stay on the screen; while a workspace is open, a create-canvas row for that workspace SHALL also stay on the screen. When there are no workspaces, the map SHALL show an empty-state message. Settings SHALL remain reachable from the top bar.

#### Scenario: Open a workspace branch

- **WHEN** the user opens a workspace that contains canvases "dol" and "Launch plan"
- **THEN** the Workspaces card stays in the middle and one card appears on that workspace's branch for each canvas
- **AND** the create-canvas row names the open workspace

#### Scenario: Collapse the open branch

- **WHEN** the user has opened a workspace branch and activates "All workspaces"
- **THEN** the canvas cards fold away and only the workspace cards remain

#### Scenario: Open a canvas from its card

- **WHEN** the user activates the "Launch plan" canvas card
- **THEN** that canvas opens

#### Scenario: Delete a canvas from its card

- **WHEN** the user selects the delete action on a canvas card
- **THEN** the card asks for confirmation before anything is removed
- **AND** cancelling restores the card and returns focus to its delete action

#### Scenario: Empty workspace list

- **WHEN** there are no saved workspaces
- **THEN** the map shows an empty-state message pointing to the create-workspace row

### Requirement: Persistent activity rail on the canvas

Activity bar SHALL render a persistent left rail within the open-canvas stage, with Canvas gallery, Nodes and Inspector toggles, Open project, and Export Markdown at the top and Settings at the bottom. The rail SHALL reserve its own width even when the sidebar is closed. This preset SHALL NOT also show the Classic floating left toggles or the top-bar Canvas gallery, Open project, Export Markdown, or Settings controls. Export Markdown in the rail SHALL be icon-only with its accessible name, and its status and error messages SHALL appear beside the rail within the window. Classic SHALL retain its current controls and SHALL NOT show the rail. The rail SHALL NOT add items beyond those listed.

#### Scenario: Activity bar with the sidebar closed

- **WHEN** a canvas uses Activity bar and both sidebar sections are hidden
- **THEN** the rail remains visible and usable and only the rail's width is reserved on the left

#### Scenario: Classic is selected

- **WHEN** a canvas uses Classic
- **THEN** the current floating left toggles and top-bar Settings control are present and no activity rail is rendered

#### Scenario: Other controls retain their homes

- **WHEN** a canvas uses Activity bar
- **THEN** chat and its toggle remain on the right, drawing tools remain on the canvas, and save status and the attention control remain in the top bar
- **AND** each moved action appears exactly once and keeps its behavior

### Requirement: Activity rail stays accessible and unobscured

The rail controls SHALL have accessible names and tooltips, visible keyboard focus indicators, and theme-appropriate contrast in both light and dark themes. Nodes and Inspector SHALL expose their independent pressed states through assistive technology and a visible indicator not relying only on color. All rail controls SHALL remain reachable without horizontal scrolling at window widths down to 360px, including when a compact sidebar or chat overlay is open. Settings SHALL remain available without a backend connection. Existing focus fallbacks to Settings SHALL target the current visible Settings control in either preset.

#### Scenario: Keyboard operates independent sections

- **WHEN** the user activates Nodes and Inspector in sequence using the keyboard
- **THEN** both toggles expose a pressed state and both sidebar sections are visible

#### Scenario: Compact overlay leaves the rail usable

- **WHEN** either the sidebar or chat overlay is open in Activity bar at a 360px-wide window
- **THEN** Nodes, Inspector, and Settings remain visible and keyboard reachable without horizontal scrolling

#### Scenario: Attention queue loses its last session

- **WHEN** the attention queue closes because its last session was removed in Activity bar
- **THEN** focus moves to the rail's Settings button rather than an absent top-bar control
