import * as SVG from "@svgdotjs/svg.js"
import "@svgdotjs/svg.draggable.js"
import {
	MainController,
	SnapPoint,
	SnappingInfo,
	ButtonGridProperty,
	CanvasController,
	SelectionController,
	SectionHeaderProperty,
	GroupComponent,
	Undo,
	EditableProperty,
	SnapDragHandler,
	SnapCursorController,
	PropertiesCollection,
	PropertyCategories,
} from "../internal"
import {
	hoverColor,
	rectRectIntersection,
	referenceColor,
	selectedBoxWidth,
	selectionColor,
} from "../utils/selectionHelper"

type Constructor<T = {}> = new (...args: any[]) => T

/**
 * the root object for saving components as json. Extend this for custom components
 */
export type ComponentSaveObject = {
	type: string
	selected?: boolean
}

/**
 * Every component in the circuit should be deriving from this class.
 */
export abstract class CircuitComponent {
	/**
	 * the position of the component reference point in world coordinates
	 */
	public position: SVG.Point

	/**
	 * The vector from (0,0) to the reference position of the component (in local coordinates, i.e. without rotation, translation and scaling)
	 */
	public referencePosition: SVG.Point

	/**
	 * all properties, which should be able to be edited in the properties window have to be included here
	 */
	public properties: PropertiesCollection

	/**
	 * the name of the component (e.g. "Resistor", "Wire" or "Transformer")
	 */
	public displayName: string

	/**
	 * For keeping track of the parent group of this component if one exists.
	 */
	public parentGroup: GroupComponent = null

	/**
	 * If the component is currently selected by the selection controller
	 */
	private _isSelected: boolean = false
	public get isSelected(): boolean {
		return this._isSelected
	}
	public set isSelected(value: boolean) {
		if (!value) {
			if (this.isSelectionReference) {
				SelectionController.instance.referenceComponent = null
			}
			this.isSelectionReference = false
		}
		this._isSelected = value
	}

	/**
	 * the cached bounding box of the component in world coordinates. Useful for example for the selection controller
	 */
	protected _bbox: SVG.Box
	/**
	 * getter for the cached bounding box
	 */
	public get bbox(): SVG.Box {
		return this._bbox
	}

	/**
	 * the SVG.js Element which represents the visualization/graphics of the component on the canvas. This includes the actual component as well the label, the element used for dragging and other parts. Should probably always be a group containing more svg components
	 */
	public visualization: SVG.Element

	/**
	 * The SVG.js Element which is used to visualize the selection of the component. Should probably always be a rectangle
	 */
	public selectionElement: SVG.Element = null

	/**
	 * The SVG.js Element which is used to visualize the component. This has to be added to the visualization element as a child @see CircuitComponent.visualization
	 */
	public componentVisualization: SVG.Element

	/**
	 * the element which can be grabbed and dragged. Mostly the whole visualization, but for some components it might be a sub-element
	 */
	protected dragElement: SVG.Element

	/**
	 * A List of all the Snapping points of this component
	 */
	public snappingPoints: SnapPoint[]

	/**
	 * A map of all the properties which are used by this component. The key is the ID of the property, which can be used to filter for multi-component editing
	 */
	public componentProperties: Map<string, EditableProperty<any>> = new Map()

	private _isHovered = false

	public get isHovered(): boolean {
		return this._isHovered
	}

	public set isHovered(value: boolean) {
		this._isHovered = value
		this.showSeletedOrHovered()
	}

	/**
	 * The default constructor giving basic functionality. Never call this directly (only via super() in the constructor of the derived class).
	 */
	public constructor() {
		this.position = new SVG.Point()
		this.finishedPlacing = false
		this.referencePosition = new SVG.Point()
		//every time a component is initialized, it should be added to the component list for housekeeping
		MainController.instance.addComponent(this)
		this.selectionElement = CanvasController.instance.canvas.rect(0, 0).hide()
		this.selectionElement.node.classList.add("selectionElement")
		this.selectionElement.node.style.pointerEvents = "none"

		this.visualization = CanvasController.instance.canvas.group()

		this.dragElement = this.visualization

		this.displayName = "Circuit Component"
		this.properties = new PropertiesCollection()
		this.addPositioning()
		this.addZOrdering()
	}

	/**
	 * Add z-index ordering to the properties window
	 */
	private addZOrdering() {
		// all components should receive the possiblity to change their draw order/z order/depth
		let ordering = new ButtonGridProperty(
			2,
			[
				["Foreground", ""],
				["Background", ""],
				["Forward", ""],
				["Backward", ""],
			],
			[
				(ev) => CanvasController.instance.componentsToForeground([this]),
				(ev) => CanvasController.instance.componentsToBackground([this]),
				(ev) => CanvasController.instance.moveComponentsForward([this]),
				(ev) => CanvasController.instance.moveComponentsBackward([this]),
			],
			false,
			[
				"Bring the component to the foreground",
				"Move the component to the background",
				"Move the component one step towards the foreground",
				"Move the component one step towards the background",
			]
		)
		this.properties.add(PropertyCategories.ordering, new SectionHeaderProperty("Ordering"))
		this.properties.add(PropertyCategories.ordering, ordering)
	}

	/**
	 * Add rotation and flipping to the properties window
	 */
	private addPositioning() {
		let positioning = new ButtonGridProperty(
			2,
			[
				["Rotate 90° CW", "rotate_right"],
				["Rotate 90° CCW", "rotate_left"],
				["Rotate 45° CW", "rotate_right"],
				["Rotate 45° CCW ", "rotate_left"],
				["Flip vertically", ["flip", "rotateText"]],
				["Flip horizontally", "flip"],
			],
			[
				(ev) => {
					this.rotate(-90)
					Undo.addState()
				},
				(ev) => {
					this.rotate(90)
					Undo.addState()
				},
				(ev) => {
					this.rotate(-45)
					Undo.addState()
				},
				(ev) => {
					this.rotate(45)
					Undo.addState()
				},
				(ev) => {
					this.flip(true)
					Undo.addState()
				},
				(ev) => {
					this.flip(false)
					Undo.addState()
				},
			],
			false,
			[
				"Rotate the component 90 degrees clockwise",
				"Rotate the component 90 degrees counter clockwise",
				"Rotate the component 45 degrees clockwise",
				"Rotate the component 45 degrees counter clockwise",
				"Flip the component around its x-axis",
				"Flip the component around its y-axis",
			]
		)
		this.properties.add(PropertyCategories.manipulation, positioning)
	}

	/**
	 * Used by the snap controller to figure out which of the snapping points should be taken into account for snapping and if their should be additional snapping points, which are not normally part of the component (for example the center point of a node component, which should be snappable when moving this component but not snappable when being snapped to this component)
	 */
	public abstract getSnappingInfo(): SnappingInfo

	/**
	 * Set this component draggable or not
	 * @param drag if dragging should be enabled
	 */
	public draggable(drag: boolean): void {
		if (drag) {
			this.visualization.node.classList.add("draggable")
		} else {
			this.visualization.node.classList.remove("draggable")
		}
		SnapDragHandler.snapDrag(this, drag, this.dragElement)
	}

	protected abstract recalculateResizePoints(): void

	/**
	 * Move the component to the specified position
	 * @param position where the circuitComponent.position should now be
	 */
	public abstract moveTo(position: SVG.Point): void
	/**
	 * Move the component by the specified delta, i.e. the new position = old position + delta
	 * @param delta by how much the component should be moved
	 */
	public abstract moveRel(delta: SVG.Point): void
	/**
	 * Rotate the component by the specified angle. (This should not set the rotation of the component, but rotate the component further along by the specified angle)
	 * @param angleDeg angle in degrees
	 */
	public abstract rotate(angleDeg: number): void
	/**
	 * Flip the component along the horizontal or vertical axis
	 * @param horizontalAxis if the component should be flipped around the horizontal or vertical axis
	 */
	public abstract flip(horizontalAxis: boolean): void

	/**
	 * Update the component, it's visualization, snapping points, selection visuals and transform matrix/position
	 */
	protected abstract update(): void

	/**
	 * update the graphics corresponding to the component selection visualization
	 */
	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			let box = this.visualization.bbox().transform(this.getTransformMatrix())

			this.selectionElement.size(box.w, box.h)
			this.selectionElement.center(box.cx, box.cy)
		}
	}

	private viewAsSelected = false
	/**
	 * Show or hide the selection visualization of the component. This has to be distinct from the actual selection state due to how the selection controller works
	 * @param show if the component should appear selected or not
	 */
	public viewSelected(show: boolean): void {
		this.viewAsSelected = show
		this.showSeletedOrHovered()
	}

	private showSeletedOrHovered() {
		if (this.viewAsSelected || this.isHovered) {
			CanvasController.instance.canvas.put(this.selectionElement)
			this.selectionElement.show()

			const color =
				this.isHovered ? hoverColor
				: this.isSelectionReference ? referenceColor
				: selectionColor

			this.selectionElement
				.stroke({
					width: selectedBoxWidth,
					color: color,
					dasharray: this.isSelectionReference ? "1, 1" : "4, 2",
				})
				.fill("none")
			this.recalculateSelectionVisuals()
		} else {
			this.selectionElement.hide()
		}
	}

	protected isSelectionReference = false
	public setAsSelectionReference(): void {
		if (SelectionController.instance.referenceComponent) {
			SelectionController.instance.referenceComponent.isSelectionReference = false
			SelectionController.instance.referenceComponent.viewSelected(
				SelectionController.instance.referenceComponent.isSelected
			)
		}
		this.isSelectionReference = true
		this.viewSelected(true)
	}

	/**
	 * Checks if the component is inside the selection visualization. The default implementation is a rect-rect intersection check between the selection rectangle and the component bounding box. Override this for a more sophisticated check
	 * @param selectionRectangle where the current selection is requested
	 * @returns true if the selection rectangle encompases (a part of) the component
	 */
	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		return rectRectIntersection(this.bbox, selectionRectangle)
	}

	/**
	 * update the visuals to comply with dark/light mode
	 */
	public abstract updateTheme()

	/**
	 * Converts the Component into a ComponentSaveObject or a derived type therof. This should encompass all information necessary to reproduce this component via {@link fromJson}
	 * Override this in your subclass and call the super() method to ensure that the base class properties are also included.
	 */
	public toJson(): ComponentSaveObject {
		let saveObject: ComponentSaveObject = {
			type: "component",
		}
		return saveObject
	}
	/**
	 * convert this component into a draw command for CircuiTikz
	 */
	public abstract toTikzString(): string

	/**
	 * Override this in subclasses if it should provide a way of building (parts of) a tikz node or path command (remember to always call the superclass via super.buildTikzCommand)
	 * @param command an object representing the components of a tikz command
	 * @param contextData the context needed to build (parts of) the command
	 */
	protected buildTikzCommand(command: {}): void {}

	/**
	 * convert this component to be used with the svg export, i.e. clones the visualization and handles all use elements. override this to add custom functionality like removing additional elements.
	 * @param defs which definitions this component uses should be added to the map<id, element>. defs should be checked before adding to avoid duplicates
	 */
	public toSVG(defs: Map<string, SVG.Element>): SVG.Element {
		const copiedSVG = this.visualization.clone(true)
		for (const use of copiedSVG.find("use")) {
			let id = use.node.getAttribute("xlink:href") ?? use.node.getAttribute("href")
			if (id) {
				id = id.startsWith("#") ? id.slice(1) : id
				if (!defs.has(id)) {
					const element = new SVG.Element(document.getElementById(id).cloneNode(true))
					defs.set(id, element)
				}
			}
		}
		return copiedSVG
	}
	/**
	 * Convert a ComponentSaveObject to a component. This requires 2 steps:
	 * 1) Define a public static fromJson method which returns an instance of the component. This should only handle proper initialization and no parameter setting. See NodeSymbolComponent
	 * 2) Override the applyJson method which should contain a super.applyJson call. This method should only handle parameters not already handled by the respective super class(es)
	 */
	protected applyJson(saveObject: ComponentSaveObject): void {
		// highest level doesn't do anything (essentially only the type but this is not used here)
		SnapCursorController.instance.visible = false
		this.finishedPlacing = true
		this.draggable(true)
	}

	protected static jsonSaveMap: Map<string, Constructor<CircuitComponent>> = new Map()
	public static fromJson(saveObject: ComponentSaveObject): CircuitComponent {
		const ComponentConstructor = CircuitComponent.jsonSaveMap.get(saveObject.type)
		if (ComponentConstructor == undefined) {
			throw new Error(
				'There is no component of type "' +
					saveObject.type +
					'" defined. Every non-abstract class deriving from CircuitComponent (or one of its subclasses) should have a static block, which registers it by setting the type as the key and the class itself as the value of the jsonSaveMap static variable (see NodeSymbolComponent as a reference)'
			)
		}
		if (!Object.hasOwn(ComponentConstructor, "fromJson")) {
			throw new Error(
				ComponentConstructor.name +
					" does not implement a fromJson method! See CircuitComponent.applyJson for more info."
			)
		}
		// @ts-ignore
		const component: CircuitComponent = ComponentConstructor.fromJson(saveObject)
		if (component) {
			component.applyJson(saveObject)
			return component
		}
	}

	/**
	 * Obtain the transformation matrix which transforms an object from the local coordinates to the world coordiantes.
	 * Default implementation returns the identity matrix, i.e. local coordinates = world coordinates.
	 *
	 * Override this!
	 *
	 * @returns the transformation matrix
	 */
	public getTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix()
	}

	/**
	 * Update the position of all snapping points associated with this component.
	 * @param matrix which matrix to use. probably the one returned by {@link getTransformMatrix}
	 */
	public recalculateSnappingPoints(matrix?: SVG.Matrix) {
		for (const snappingPoint of this.snappingPoints) {
			snappingPoint.recalculate(matrix)
		}
	}

	/**
	 * create a copy from the provided CircuitComponent but ready for component placement
	 */
	public abstract copyForPlacement(): CircuitComponent

	/**
	 * remove the component from the canvas
	 */
	public remove(): void {
		SnapDragHandler.snapDrag(this, false)
		this.visualization.remove()
		this.viewSelected(false)
		this.selectionElement?.remove()
	}

	// component placement code
	/**
	 * if the component is finished placing down/creating
	 */
	protected finishedPlacing = false

	/**
	 * Override this if the component can be rotated while placing down. @see CircuitComponent.rotate for details
	 * @param angleDeg how far to rotate
	 */
	public placeRotate(angleDeg: number): void {}

	/**
	 * Override this if the component can be flipped while placing down. @see CircuitComponent.flip for details
	 * @param horizontal on which axis to rotate
	 */
	public placeFlip(horizontal: boolean): void {}

	/**
	 *
	 * @param pos where the mouse/pointer/cursor was moved
	 * @param ev the context of the movement
	 */
	public abstract placeMove(pos: SVG.Point, ev?: Event): void
	/**
	 * One placement step. Probably a click or touch. Return true if the component is done with the placement.
	 * @param pos where the mouse/pointer/cursor is
	 * @param ev the context of the click/touch
	 * @returns true if the placing is done, false otherwise
	 */
	public abstract placeStep(pos: SVG.Point, ev?: Event): boolean
	/**
	 * Called by ComponentPlacer after {@link placeStep}==true to clean up the component placement. Also instantly finishes the placement when called
	 */
	public abstract placeFinish(): void // call this to force the placement to finish

	/**
	 * Returns the list of TikZ libraries which are required for this component to work. This is used to automatically include the libraries in the generated code.
	 *
	 * Override this to add libraries
	 * @returns a list of tikz library names (strings)
	 */
	public requiredTikzLibraries(): string[] {
		return []
	}
}
