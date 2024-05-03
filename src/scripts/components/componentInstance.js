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

// TODO add cancel function with right click/Esc when adding a new component