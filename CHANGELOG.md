# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0]

### Added

- Rectangle(square) and Ellipse(circle) components
- Text via the rectangle component
- New shortcut: T for placing rectangles/text
- Label coloring
- Label positioning:
    - Gap to the component for adjusting the distance
    - Choosing the side for path components
    - Choose anchor and position for other components
- Aligning and distributing components
- Wires now moveable
- Wire points can be edited
- Can add basic arrows to wire endpoints
- More z-order control (move forward or backward)
- Can now also rotate and flip components on mobile via buttons in the properties window
- Color fill for rectangle and ellipse components
- Stroke options for wires, rectangle and ellipse components
- Better snapping visualizations

### Changed

- The titlebar now shows actions only if the device has enough available space, otherwise collapses them into a toggle menu
- Path component adjustment points now look the same as other adjustment points
- Page layout on mobile

### Fixed

- Mobile controls. Can now use mobile with slightly reduces functionality
- Selection visualisation/bounding boxes now more consistent
- Many small bugfixes

## [0.4.2]

### Fixed

- path components sometimes flickered when moving them if they have a label and are oriented a certain way

## [0.4.1]

### Fixed

- loading a json didn't load wires

## [0.4.0]

### Added

- Properties window (shows information about currently selected component)
- Changeable grid settings like grid size
- Labeling via Mathjax (very close to Tex syntax)
- Changeable settings for path components
    - name
    - label
    - mirror/invert
    - z-order via buttons
- Changeable settings for node components
    - name
    - label
    - z-order via buttons

## Changed

- Naming of components in component drawer
- Preference loading logic
- Local save state per tab
- Placing components now automatically reselects the component after placing it &rarr; can rapidly place many of the same component
- save file format. still backwards compatible

## [0.3.1]

### Changed

- Save state management of browser sessions now more versatile (multiple sessions with different circuit designs)

### Fixed

- Position of selection rectangle for path components fixed on Safari
- Meta tags for website previews using the open graph protocol

## [0.3.0]

### Added

- Dark mode
- Many new components:
    - CircuiTikZ manual chapter 4.7 - Mechanical Analogy
    - CircuiTikZ manual chapter 4.9 - Multiple wires (buses)
    - CircuiTikZ manual chapter 4.12 - Terminal shapes
    - CircuiTikZ manual chapter 4.14 - Block diagram components
    - CircuiTikZ manual chapter 4.16 - Electronic tubes
    - CircuiTikZ manual chapter 4.17 - RF components
    - CircuiTikZ manual chapter 4.19 - Transformers
    - CircuiTikZ manual chapter 4.20 - Amplifiers
    - CircuiTikZ manual chapter 4.21 - Switches, Buttons and jumpers
    - CircuiTikZ manual chapter 4.22 - Logic gates
    - Metal-oxide varistor
    - Current tap (probe)
    - Wiggly fuse
    - Relais
    - Neon lamp (double cathode + anode and cathode)
    - Spark gap
    - IEC 60617 connector as path
- Additional snap points for some components
- New shortcut for an unconnected terminal (Alt/Option + .)
- Clicking on a component without dragging now selects the component
- MacOS keyboard shortcut definitions
- "Backspace" now also deletes components
- More UI tooltips

### Changed

- All descriptions of all components in the component drawer. No more IDs, more descriptive
- Default camera zoom level
- Minimum size of symbols in component drawer
- Adjusted component categories slightly. "Wiring" category now encompasses more components
- Only start showing snapping points when actually dragging
- Component drawer search bar is now always visible when the component drawer is visible

### Fixed

- Dragging a path component at its center now properly snaps

## [0.2.0]

### Added

- Selections
- Undo/Redo
- Copy/Paste
- Save/Load
- Export as SVG
- Navbar for aesthetics
- Help menu

### Changed

- Readme for GitHub release

## [0.1.0]

### Added

- Initial release of this changelog.
