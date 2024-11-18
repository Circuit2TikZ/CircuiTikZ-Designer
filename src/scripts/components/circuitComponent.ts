import * as SVG from "@svgdotjs/svg.js"
import "@svgdotjs/svg.draggable.js"
import {
	MainController,
	SnapPoint,
	SnappingInfo,
	ButtonGridProperty,
	CanvasController,
	MathJaxProperty,
	SelectionController,
	ColorProperty,
	SliderProperty,
	ChoiceEntry,
	SectionHeaderProperty,
	TextProperty,
} from "../internal"
import { rectRectIntersection, referenceColor, selectedBoxWidth, selectionColor } from "../utils/selectionHelper"

/**
 * names cannot contain punctuation, parentheses and some other symbols
 */
export const invalidNameRegEx = /[\t\r\n\v.,:;()-]/

/**
 * the root object for saving components as json. Extend this for custom components
 */
export type ComponentSaveObject = {
	type: string
	selected?: boolean
}

export type DirectionInfo = ChoiceEntry & {
	direction: SVG.Point
	pointer?: string
}

/**
 * A type encompassing all information needed for the label
 */
export type Label = {
	value: string
	rendering?: SVG.Element
	distance?: SVG.Number
	color?: string | "default"
}

export type PositionedLabel = Label & {
	anchor?: string
	position?: string
}

export const basicDirections: DirectionInfo[] = [
	{ key: "default", name: "default", direction: new SVG.Point(NaN, NaN) },
	{ key: "center", name: "center", direction: new SVG.Point() },
	{ key: "north", name: "north", direction: new SVG.Point(0, -1), pointer: "ns-resize" },
	{ key: "south", name: "south", direction: new SVG.Point(0, 1), pointer: "ns-resize" },
	{ key: "east", name: "east", direction: new SVG.Point(1, 0), pointer: "ew-resize" },
	{ key: "west", name: "west", direction: new SVG.Point(-1, 0), pointer: "ew-resize" },
	{ key: "northeast", name: "north east", direction: new SVG.Point(1, -1), pointer: "nesw-resize" },
	{ key: "northwest", name: "north west", direction: new SVG.Point(-1, -1), pointer: "nwse-resize" },
	{ key: "southeast", name: "south east", direction: new SVG.Point(1, 1), pointer: "nwse-resize" },
	{ key: "southwest", name: "south west", direction: new SVG.Point(-1, 1), pointer: "nesw-resize" },
]
export const defaultBasicDirection = basicDirections[0]

export function getClosestPointerFromDirection(direction: SVG.Point): string {
	let minValue = Infinity
	let minPointer = "move"
	basicDirections.slice(2).forEach((item) => {
		const diffLength = item.direction.sub(direction).absSquared()
		if (diffLength < minValue) {
			minValue = diffLength
			minPointer = item.pointer
		}
	})
	return minPointer
}

export const defaultStroke = "var(--bs-emphasis-color)"
export const defaultFill = "var(--bs-body-bg)"

/**
 * Every component in the circuit should be deriving from this class.
 */
export abstract class CircuitComponent {
	/**
	 * the position of the circuit component
	 */
	public position: SVG.Point
	/**
	 * The vector from the upper left corner of the component visualization to the reference position of the component
	 */
	public relPosition: SVG.Point
	/**
	 * the current rotation angle in degrees
	 */
	public rotationDeg: number = 0

	/**
	 * all properties, which should be able to be edited in the properties window have to be included here
	 */
	public propertiesHTMLRows: HTMLElement[] = []

	/**
	 * the name of the component (e.g. "Resistor", "Wire" or "Transformer")
	 */
	public displayName: string

	/**
	 * What will be used as the reference name in the tikz code (e.g. "\node[] (name) at (0,0){};"").
	 * Not used for all components, e.g. wire
	 */
	public name: TextProperty

	/**
	 * If the component is currently selected by the selection controller
	 */
	private _isSelected: boolean = false
	public get isSelected(): boolean {
		return this._isSelected
	}
	public set isSelected(value: boolean) {
		if (!value) {
			this.isSelectionReference = false
			SelectionController.instance.referenceComponent = null
		}
		this._isSelected = value
	}

	protected isResizing: boolean = false

	/**
	 * the cached bounding box of the component. Useful for example for the selection controller
	 */
	protected _bbox: SVG.Box
	/**
	 * getter for the cached bounding box
	 */
	public get bbox(): SVG.Box {
		return this._bbox
	}

	/**
	 * the SVG.js Element which represents the visualization/graphics of the component on the canvas. Should probably always be a group containing more svg components
	 */
	public visualization: SVG.Element

	protected selectionElement: SVG.Element = null

	/**
	 * A List of all the Snapping points of this component
	 */
	public snappingPoints: SnapPoint[]

	protected mathJaxLabel: MathJaxProperty
	protected labelRendering: SVG.Element
	protected labelDistance: SliderProperty
	protected labelColor: ColorProperty

	/**
	 * The default constructor giving basic functionality. Never call this directly (only via super() in the constructor of the derived class).
	 */
	public constructor() {
		this.position = new SVG.Point()
		this.relPosition = new SVG.Point()
		//every time a component is initialized, it should be added to the component list for housekeeping
		MainController.instance.addComponent(this)

		this.displayName = "Circuit Component"
		this.addPositioning()
		this.addZOrdering()
	}

	/**
	 * Add z-index ordering to the properties window
	 */
	protected addZOrdering() {
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
			]
		)
		this.propertiesHTMLRows.push(new SectionHeaderProperty("Ordering").buildHTML())
		this.propertiesHTMLRows.push(ordering.buildHTML())
	}

	/**
	 * Add rotation and flipping to the properties window
	 */
	protected addPositioning() {
		let positioning = new ButtonGridProperty(
			2,
			[
				["Rotate CW", "rotate_right"],
				["Rotate CCW", "rotate_left"],
				["Flip vertically", ["flip", "rotateText"]],
				["Flip horizontally", "flip"],
			],
			[(ev) => this.rotate(-90), (ev) => this.rotate(90), (ev) => this.flip(true), (ev) => this.flip(false)]
		)
		this.propertiesHTMLRows.push(positioning.buildHTML())
	}

	/**
	 * Add the property for the tikz name to the properties window
	 */
	protected addName() {
		this.name = new TextProperty("Name", "")
		this.name.addChangeListener((ev) => {
			if (ev.value === "") {
				// no name is always valid
				this.name.changeInvalidStatus("")
				return
			}
			if (ev.value.match(invalidNameRegEx)) {
				// check if characters are valid
				this.name.changeInvalidStatus("Contains forbidden characters!")
				return
			}
			for (const component of MainController.instance.circuitComponents) {
				// check if another component with the same name already exists
				if (component != this) {
					if (ev.value !== "" && component.name.value == ev.value) {
						this.name.updateValue(ev.previousValue, false)
						this.name.changeInvalidStatus("Name is already taken!")
						return
					}
				}
			}
			this.name.changeInvalidStatus("")
		})
		this.propertiesHTMLRows.push(new SectionHeaderProperty("TikZ name").buildHTML())
		this.propertiesHTMLRows.push(this.name.buildHTML())
	}

	/**
	 * Used by the snap controller to figure out which of the snapping points should be taken into account for snapping and if their should be additional snapping points, which are not normally part of the component (for example the center point of a node component, which should be snappable when moving this component but not snappable when being snapped to this component)
	 */
	public abstract getSnappingInfo(): SnappingInfo

	/**
	 * Set this component draggable or not
	 * @param drag if dragging should be enabled
	 */
	public abstract draggable(drag: boolean): void

	/**
	 * Set this component resizable or not
	 * @param resize if resizing should be enabled
	 */
	public abstract resizable(resize: boolean): void
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
	public moveRel(delta: SVG.Point): void {
		this.moveTo(this.position.add(delta))
	}
	/**
	 * Rotate the component by the specified angle
	 * @param angleDeg angle in degrees
	 */
	public abstract rotate(angleDeg: number): void
	/**
	 * Flip the component along the horizontal or vertical axis
	 * @param horizontal if the component should be flipped at the horizontal or vertical axis
	 */
	public abstract flip(horizontal: boolean): void

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
			this.selectionElement.center(this.position.x, this.position.y)
		}
	}

	/**
	 * Show or hide the selection visualization of the component. This has to be distinct from the actual selection state due to how the selection controller works
	 * @param show if the component should appear selected or not
	 */
	public viewSelected(show: boolean): void {
		if (show) {
			CanvasController.instance.canvas.put(this.selectionElement)
			this.selectionElement.show()
			this.selectionElement
				.stroke({
					width: selectedBoxWidth,
					color: this.isSelectionReference ? referenceColor : selectionColor,
					dasharray: "4, 2",
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
	public updateTheme() {
		let labelColor = defaultStroke
		if (this.labelColor.value) {
			labelColor = this.labelColor.value.toString()
		}
		this.labelRendering?.fill(labelColor)
	}

	/**
	 * helper method to always be between -180 and 180 degrees. TODO could be optimized to not use while loops but a closed form solution
	 */
	public simplifyRotationAngle() {
		while (this.rotationDeg > 180) this.rotationDeg -= 360
		while (this.rotationDeg <= -180) this.rotationDeg += 360
	}

	/**
	 * Converts the Component into a ComponentSaveObject or a derived type therof. This should encompass all information necessary to reproduce this component via {@link fromJson}
	 */
	public abstract toJson(): ComponentSaveObject
	/**
	 * convert this component into a draw command for CircuiTikz
	 */
	public abstract toTikzString(): string
	/**
	 * Convert a ComponentSaveObject to a component. Calling CircuitComponent.fromJson(A.{@link toJson}()) should essentially produce an exact copy of the component "A". Override this in your subclass!
	 * @param saveObject An object of a derived type of ComponentSaveOject, which encompasses all information necessary to initalize this component type
	 */
	public static fromJson(saveObject: ComponentSaveObject): CircuitComponent {
		throw new Error("fromJson not implemented on " + typeof this + ". Implement in derived class")
	}

	/**
	 * Obtain the transformation matrix which transforms an object from the component reference to the world reference
	 * @returns the transformation matrix
	 */
	public getTransformMatrix(): SVG.Matrix {
		return new SVG.Matrix(this.visualization.transform())
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
	 * remove the component from the program
	 */
	public abstract remove(): void

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
	 * Generate a label visualization via mathjax
	 * @param label the data for which to generate the label visualization
	 * @returns a Promise<void>
	 */
	protected async generateLabelRender(): Promise<void> {
		// @ts-ignore
		window.MathJax.texReset()
		// @ts-ignore
		return window.MathJax.tex2svgPromise(this.mathJaxLabel.value, {}).then((node: Element) => {
			// mathjax renders the text via an svg container. That container also contains definitions and SVG.Use elements. get that container
			let svgElement = new SVG.Svg(node.querySelector("svg"))

			// if a previous label was rendered, remove everything concerning that rendering
			if (this.labelRendering) {
				let removeIDs = new Set<string>()
				for (const element of this.labelRendering.find("use")) {
					removeIDs.add(element.node.getAttribute("xlink:href"))
				}

				for (const id of removeIDs) {
					let element = CanvasController.instance.canvas.node.getElementById(id)
					if (element) {
						CanvasController.instance.canvas.node.removeChild(element)
					}
				}
			}

			// move the label definitions to the overall definitions of the canvas
			let backgroundDefs = CanvasController.instance.canvas.findOne("#backgroundDefs") as SVG.Defs
			let defs = svgElement.findOne("defs") as SVG.Defs
			for (const def of defs.children()) {
				backgroundDefs.put(def)
			}
			defs.remove()

			//1.545 magic number (how large 1em, i.e. font size, is in terms of ex) for the font used in MathJax.
			//6.5 = normal font size for tikz??? This should be 10pt for the normalsize in latex? If measuring via 2 lines 1 cm apart(28.34pt), you need 6.5pt to match up with the tikz rendering!?
			let expt = (1 / 1.545) * 6.5
			//convert width and height from ex to pt via expt and then to px
			let widthStr = svgElement.node.getAttribute("width")
			let width = new SVG.Number(new SVG.Number(widthStr).value * expt, "pt").convertToUnit("px")
			let heightStr = svgElement.node.getAttribute("height")
			let height = new SVG.Number(new SVG.Number(heightStr).value * expt, "pt").convertToUnit("px")
			let size = new SVG.Point(width.value, height.value)

			// remove unnecessary data
			for (const elementGroup of svgElement.find("use")) {
				elementGroup.node.removeAttribute("data-c")
			}
			let groupElements = svgElement.find("g") as SVG.List<SVG.G>
			for (const elementGroup of groupElements) {
				elementGroup.node.removeAttribute("data-mml-node")
			}
			// remove unnecessary svg groups
			for (const elementGroup of groupElements) {
				let children = elementGroup.children()
				if (children.length == 1 && !elementGroup.node.hasAttributes()) {
					elementGroup.parent().put(children[0])
					elementGroup.remove()
				} else {
					if (elementGroup.fill() == "currentColor") {
						elementGroup.fill("inherit")
					}
				}
			}

			//remove background of mathjax error message
			for (const elementGroup of svgElement.find("rect")) {
				if (elementGroup.node.hasAttribute("data-background")) {
					elementGroup.remove()
				}
			}

			// the current rendering svg viewbox
			let svgViewBox = svgElement.viewbox()

			// scale such that px size is actually correct for rendering
			let scale = size.div(new SVG.Point(svgViewBox.w, svgViewBox.h))
			//move the rendering to local 0,0
			let translate = new SVG.Point(-svgViewBox.x, -svgViewBox.y).mul(scale)
			let m = new SVG.Matrix({
				scaleX: scale.x,
				scaleY: scale.y,
				translateX: translate.x,
				translateY: translate.y,
			})
			// add all symbol components to a group
			let transformGroup = new SVG.G()
			for (const child of svgElement.children()) {
				transformGroup.add(child)
			}
			// apply the transformation --> the symbol is now at the origin with the correct size and no rotation
			transformGroup.transform(m)

			// remove the current label and substitute with a new group element
			this.labelRendering?.remove()
			let rendering = new SVG.G()
			rendering.addClass("pointerNone")
			rendering.add(transformGroup)
			// add the label rendering to the visualization element
			this.visualization.add(rendering)
			this.labelRendering = rendering
			this.update()
			this.updateTheme()
		})
	}

	/**
	 * Updates the position of the label when moving/rotating... Override this!
	 */
	public abstract updateLabelPosition(): void

	public requiredTikzLibraries(): string[] {
		return []
	}
}
