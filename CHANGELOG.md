# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.5]

### Changed

- Now cannot close currently open tabs anymore since this doesn't work all the time (only if the tabs opened each other). Highlighting the tabs instead.

## [0.7.4]

### Fixed

- Fixed a bug where plain polygons couldn't be exported

## [0.7.3]

## Added

- Basic Flip flops

## Changed

- Exporting to SVG now doesn't require Computer Modern on the device, where the SVG will be used
- Symbols now updated to circuitikz version 1.8.2

## Fixed

- Default text position for circuitikz nodes now correct (bug fixed in circuitikz v1.8.2)
- Path label distance now correctly reflected in exported tikz code

## [0.7.2]

### Fixed

- SVG export of text with mathjax ignoring the mathjax
- Path label positioning for vertical paths

## [0.7.1]

### Fixed

- SVG export leading to a crash in some cases

## [0.7.0]

### Added

- Can now select the desired component variant via changing the options in the properties window (Issue #33)
- Tab management system (open in settings)
- Copy and paste between different tabs
- Rectangle text now able to use mathjax/LaTeX expressions. Just enter math mode like you would do in LaTeX (surround with $-signs or \\(\\)-pair) (Issue #49)
- Ability to use hyphenation in rectangle text. Use with caution: Very basic implementation --> LaTeX export will produce different hyphenation
- Indication for which component is currently hovered over
- Fit view button in canvas properties to fit the view to the components
- Component for Text (Same as rectangle component but different default values) (Issue #48)
- Different wire component defaults (some with arrows preapplied) (Issue #46)

### Changed

- Improved search function in component drawer (regex now supported)
- Can now choose if the label should be placed relative to the component transform or the canvas for node components (components which are represented by node commands in Tikz)
- Default opacity now 1 (Issue #47)
- Rectangle text now uses computer modern like LaTeX
- Selection and snapping visuals adjusted
- Visuals for checkboxes in properties window now consistent with other properties

### Fixed

- Rectangle text now escapes special characters (Issue #51)
- Bounding box size and position for some components
- Selecting text inside a text input field in the properties is now not deselected when ending the selection inside the canvas
- Pasting before copying for the first time now ignores the paste command
- many minor fixes

## [0.6.0]

### Added

- Rotate components by 45 degrees with a dedicated button in the properties window
- Scale circuitikz components (This also scales the line width, which is not the case with TikZ, i.e. what you see in CircuiTikZ-Designer will be slightly different than what you get in TikZ so keep that in mind)
- Can now group and ungroup components

### Changed

- No more ForeignObjects are used in the SVG components and export. This should dramatically increase compatibility of the SVG export with 3rd party software.

### Fixed

- The grid was not drawn exactly where it should have been drawn
- Many other small fixes

## [0.5.2]

### Fixed

- Clicking the "Draw wires" tool while placing a component would essentially brick the tool (Hotkeys unaffected)

## [0.5.1]

### Fixed

- Path components didn't show resize points

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
- Possible to generate executables via electron

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
