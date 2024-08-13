/**
 * @module componentInstance
 */

/** @typedef {import("../snapDrag/snapPoint")} SnapPoint */

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
 * @function ComponentInstance.finishedPlacingCallback
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
 * Moves the component by its mid point.
 * @function ComponentInstance.move
 *
 * @param {number} x - the new mid x coordinate
 * @param {number} y - the new mid y coordinate
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
 * @param {string} serialized
 * @returns {ComponentInstance}
 */

/**
 * @function ComponentInstance#toJson
 * Create a instance from the (saved) serialized text.
 *
 * @param {string} serialized - the saved text/instance
 * @returns {ComponentInstance} the deserialized instance
 */

/**
 * @function ComponentInstance#toTikzString
 * Stringifies the component in TikZ syntax.
 *
 * @returns {string} the serialized instance
 */