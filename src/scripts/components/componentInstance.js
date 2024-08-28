/**
 * @module componentInstance
 */

/** @typedef {import("../snapDrag/snapPoint")} SnapPoint */
/** @typedef {import("../controllers/propertiesController")} FormEntry */

/**
 * @interface ComponentInstance
 * @typedef ComponentInstance
 * @property {SnapPoint[]} snappingPoints
 */

/**
 * @function ComponentInstance.createInstance
 * Add a instance of an (path) symbol to an container.
 *
 * @param {PathComponentSymbol} symbol - the symbol to use
 * @param {SVG.Container} container - the container/canvas to add the symbol to
 * @param {MouseEvent} [_event] - an optional (mouse/touch) event, which caused the element to be added
 * @param {function():void} finishedPlacingCallback callback getting called when the element has been placed
 * @returns {ComponentInstance}
 */

/**
 * @function ComponentInstance.getFormEntries
 * @returns {FormEntry[]}
 */

/**
 * @function ComponentInstance.updateTheme
 */

/**
 * @function ComponentInstance#finishedPlacingCallback
 */

/**
 * @function ComponentInstance.isInsideSelectionRectangle
 * @param {SVG.Box} selectionRectangle
 * @returns {boolean}
 */

/**
 * @function ComponentInstance.bbox
 * @returns {SVG.Box}
 */

/**
 * @function ComponentInstance.getAnchorPoint
 * @returns {SVG.Point}
 */

/**
 * @function ComponentInstance.showBoundingBox
 */

/**
 * @function ComponentInstance.hideBoundingBox
 */

/**
 * @function ComponentInstance.remove
 */

/**
 * Moves the component by its anchor point to the new point. Overload for SVG.move
 * @function ComponentInstance.move
 *
 * @param {number} x - the x coordinate
 * @param {number} y - the y coordinate
 * @returns {ComponentInstance}
 */

/**
 * Moves the component delta units.
 * @function ComponentInstance.moveRel
 *
 * @param {SVG.Point} delta - the relative movement
 * @returns {ComponentInstance}
 */

/**
 * Moves the component by its anchor point to the new point.
 * @function ComponentInstance.moveTo
 *
 * @param {SVG.Point} position - the new anchor position
 * @returns {ComponentInstance}
 */

/**
 * Flips the component at its center
 * @function ComponentInstance.flip
 *
 * @param {boolean} horizontal - if the flip should be horizontal or vertical
 * @returns {ComponentInstance}
 */

/**
 * Rotate the instance counter clockwise around its midAbs point.
 * @function ComponentInstance.rotate
 *
 * @param {number} angleDeg
 * @returns {ComponentInstance}
 */

/**
 * Flip the component horizontally or vertically
 * @function ComponentInstance.flip
 *
 * @param {boolean} horizontal along which axis to flip
 * @returns {ComponentInstance}
 */

/**
 * @function ComponentInstance.fromJson
 * Create a instance from the (saved) serialized text.
 *
 * @param {object} serialized
 * @returns {ComponentInstance}
 */

/**
 * @function ComponentInstance.toJson
 * Serialize the component in an object
 *
 * @returns {object} the serialized instance
 */

/**
 * @function ComponentInstance.toTikzString
 * Stringifies the component in TikZ syntax.
 *
 * @returns {string} the serialized instance
 */