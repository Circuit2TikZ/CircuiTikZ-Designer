import * as SVG from "@svgdotjs/svg.js"
import "@svgdotjs/svg.panzoom.js"
import {
	SnapController,
	Undo,
	CircuitComponent,
	MainController,
	SelectionController,
	CanvasSettings,
	PropertyController,
} from "../internal"

type PanningEventDetail = {
	box: SVG.Box
	event: MouseEvent
}

type WheelZoomEventDetail = {
	level: number
	focus: SVG.Point
}

type PinchZoomEventDetail = {
	box: SVG.Box
	focus: SVG.Point
}

/**
 * Controller for the SVG canvas. Enables/disables zooming and panning. Manages selections
 * @class
 */
export class CanvasController {
	/**
	 * Static variable holding the instance.
	 */
	public static instance: CanvasController
	/**
	 * The (root) SVG Element. All lines and components are children of this element.
	 */
	public canvas: SVG.Svg
	/**
	 * The background (grid)
	 */
	public paper: SVG.Rect
	/**
	 * The line marking the x axis
	 */
	public xAxis: SVG.Line
	/**
	 * The line marking the y axis
	 */
	public yAxis: SVG.Line

	/** Distance between major grid lines
	 */
	public majorGridSizecm = 1
	/** How many minor grid lines are drawn for every major grid line
	 */
	public majorGridSubdivisions = 4
	public gridVisible = true

	/**
	 * Needed for window size changes to reconstruct the old zoom level.
	 */
	private canvasBounds: DOMRect | null = null

	private invScreenCTM: SVG.Matrix | null = null

	/** zoom parameters; small zoomFactor for more granular control
	 */
	private zoomFactor = 0.1
	private zoomMin = 0.25
	private zoomMax = 10
	private zoomCurrent = 2
	public get currentZoom() {
		return this.zoomCurrent
	}

	/**
	 * the last point on the canvas
	 */
	public lastCanvasPoint = new SVG.Point(0, 0)

	/**
	 * set this to the input element where a drag started to prevent the svg canvas from stealing the focus off the input element
	 */
	public draggingFromInput: HTMLElement = null

	/**
	 * Create the canvas controller.
	 * @param {SVG.Svg} canvas - the (wrapped) svg element
	 */
	constructor(canvas: SVG.Svg) {
		if (CanvasController.instance) {
			return
		}
		localStorage.removeItem("circuitikz-designer-view")
		CanvasController.instance = this

		this.canvas = canvas
		this.paper = SVG.SVG("#grid") as SVG.Rect
		this.xAxis = SVG.SVG("#xAxis") as SVG.Line
		this.yAxis = SVG.SVG("#yAxis") as SVG.Line

		document.addEventListener("mouseup", (ev) => {
			CanvasController.instance.draggingFromInput = null
		})

		const panFactor = 20
		let body = document.getElementsByTagName("body")[0]
		document.addEventListener("keydown", (ev) => {
			// pan canvas manually/ move selection slightly
			if (!ev.key) {
				return
			}
			if (ev.key.startsWith("Arrow") && ev.target == body) {
				let direction = new SVG.Point()
				direction.x =
					ev.key == "ArrowRight" ? 1
					: ev.key == "ArrowLeft" ? -1
					: 0
				direction.y =
					ev.key == "ArrowUp" ? -1
					: ev.key == "ArrowDown" ? 1
					: 0

				if (SelectionController.instance.hasSelection()) {
					SelectionController.instance.moveSelectionRel(direction.mul(1 / this.zoomCurrent))
				} else {
					//move canvas
					let currentViewBox = this.canvas.viewbox()
					let newPos = new SVG.Point(currentViewBox.x, currentViewBox.y).add(
						direction.mul(panFactor / this.zoomCurrent)
					)
					// this.canvas.zoom(this.zoomCurrent,newPos)
					this.canvas.viewbox(newPos.x, newPos.y, currentViewBox.w, currentViewBox.h)
					this.movePaper({ detail: {} } as CustomEvent)
				}
			}
		})

		this.onResizeCanvas()
		this.resetView()

		// observe page size change
		new ResizeObserver(this.onResizeCanvas.bind(this)).observe(this.canvas.node)

		// init pan & zoom
		this.activatePanning()

		// Drag picture with mouse
		canvas.on("panning", this.movePaper, this, { passive: false })

		// Mouse wheel OR pinch zoom
		// Wheel zoom is fired before the actual change and has no detail.box and is thus ignored. It will be handled by wheel.panZoom.
		canvas.on("zoom", this.movePaper, this, { passive: true })

		canvas.on("mousemove", (evt: MouseEvent) => {
			this.lastCanvasPoint = CanvasController.eventToPoint(evt, false)
		})
		canvas.on("touchmove", (evt: TouchEvent) => {
			this.lastCanvasPoint = CanvasController.eventToPoint(evt, false)
		})

		const oldViewBoxFunction = this.canvas.viewbox
		this.canvas.viewbox = (...args) => {
			if (arguments.length > 0) this.invScreenCTM = null
			return oldViewBoxFunction.apply(this.canvas, args)
		}

		const oldZoomFunction = this.canvas.zoom
		this.canvas.zoom = (...args) => {
			if (arguments.length > 0) this.invScreenCTM = null
			return oldZoomFunction.apply(this.canvas, args)
		}

		let gridVisibleToggle = document.getElementById("gridVisible") as HTMLInputElement

		gridVisibleToggle.addEventListener("change", (ev) => {
			this.gridVisible = gridVisibleToggle.checked
			if (this.gridVisible) {
				if (this.paper.hasClass("d-none")) {
					this.paper.removeClass("d-none")
				}
			} else {
				this.paper.addClass("d-none")
			}
		})
	}

	public setSettings(settings: CanvasSettings) {
		this.majorGridSizecm = settings.majorGridSizecm || this.majorGridSizecm
		this.majorGridSubdivisions = settings.majorGridSubdivisions || this.majorGridSubdivisions
		PropertyController.instance.setSliderValues(this.majorGridSizecm, this.majorGridSubdivisions)
		this.gridVisible = settings.gridVisible || this.gridVisible
		let gridVisibleToggle = document.getElementById("gridVisible") as HTMLInputElement
		gridVisibleToggle.checked = this.gridVisible
		if (!this.gridVisible) {
			this.paper.addClass("d-none")
		}
		if (settings.viewBox) {
			this.canvas.viewbox(settings.viewBox)
			this.canvas.zoom(settings.viewZoom, new SVG.Point())
			this.zoomCurrent = settings.viewZoom
			this.onResizeCanvas()
		}
	}

	public resetView() {
		// shift whole canvas down such that the origin is in the bottom left corner
		let box = this.canvas.viewbox()
		box.x = 0
		box.y = 0

		box.y -= box.h
		// shift canvas up right to see the axes with the default view
		let moveAmount = Math.max(0.05 * Math.min(box.w, box.h), 10)
		box.x -= moveAmount
		box.y += moveAmount
		this.canvas.viewbox(box)
		this.zoomCurrent = 2
		this.canvas.zoom(this.zoomCurrent, new SVG.Point())
		this.onResizeCanvas()
	}

	public fitView() {
		let bbox: SVG.Box = null
		for (const component of MainController.instance.circuitComponents) {
			let compBBox = component.visualization.bbox()
			if (bbox) {
				bbox = bbox.merge(compBBox)
			} else {
				bbox = compBBox
			}
		}

		if (bbox) {
			let canvasBox = this.canvas.viewbox()
			let zoomFactor = Math.min(canvasBox.w / bbox.w, canvasBox.h / bbox.h) * 0.98 // sligtly more zoomed out
			if (zoomFactor * this.zoomCurrent > this.zoomMax) {
				zoomFactor = this.zoomMax / this.zoomCurrent
			} else if (zoomFactor * this.zoomCurrent < this.zoomMin) {
				zoomFactor = this.zoomMin / this.zoomCurrent
			}
			let newSize = new SVG.Point(canvasBox.w, canvasBox.h).mul(zoomFactor)
			canvasBox = new SVG.Box(bbox.cx - newSize.x / 2, bbox.cy - newSize.y / 2, newSize.x, newSize.y)
			this.canvas.viewbox(canvasBox)
			this.zoomCurrent *= zoomFactor
			this.canvas.zoom(this.zoomCurrent, new SVG.Point(bbox.cx, bbox.cy))
			this.onResizeCanvas()
		} else {
			this.resetView()
		}
	}

	public moveComponentsForward(components: CircuitComponent[]) {
		if (MainController.instance.circuitComponents.length < 2 || components.length == 0) {
			return
		}
		let idxComps = components.map((c) => {
			return { idx: MainController.instance.circuitComponents.findIndex((cc) => cc === c), component: c }
		})
		idxComps.sort((a, b) => a.idx - b.idx).reverse()
		let lastSelectedIndex = MainController.instance.circuitComponents.length
		let switched = false
		for (const idxComp of idxComps) {
			if (idxComp.idx !== lastSelectedIndex - 1) {
				//switch the components
				let switchComponent = MainController.instance.circuitComponents[idxComp.idx + 1]
				idxComp.component.visualization.insertAfter(switchComponent.visualization)
				MainController.instance.circuitComponents[idxComp.idx] = switchComponent
				MainController.instance.circuitComponents[idxComp.idx + 1] = idxComp.component
				lastSelectedIndex = idxComp.idx + 1
				switched = true
			} else {
				lastSelectedIndex = idxComp.idx
			}
		}
		if (switched) {
			Undo.addState()
		}
	}

	public moveComponentsBackward(components: CircuitComponent[]) {
		if (MainController.instance.circuitComponents.length < 2 || components.length == 0) {
			return
		}
		let idxComps = components.map((c) => {
			return { idx: MainController.instance.circuitComponents.findIndex((cc) => cc === c), component: c }
		})
		idxComps.sort((a, b) => a.idx - b.idx)
		let lastSelectedIndex = -1
		let switched = false
		for (const idxComp of idxComps) {
			if (idxComp.idx !== lastSelectedIndex + 1) {
				//switch the components
				let switchComponent = MainController.instance.circuitComponents[idxComp.idx - 1]
				idxComp.component.visualization.insertBefore(switchComponent.visualization)
				MainController.instance.circuitComponents[idxComp.idx] = switchComponent
				MainController.instance.circuitComponents[idxComp.idx - 1] = idxComp.component
				lastSelectedIndex = idxComp.idx - 1
				switched = true
			} else {
				lastSelectedIndex = idxComp.idx
			}
		}
		if (switched) {
			Undo.addState()
		}
	}

	public componentsToForeground(components: CircuitComponent[]) {
		if (MainController.instance.circuitComponents.length < 2 || components.length == 0) {
			return
		}
		let idxComps = components.map((c) => {
			return { idx: MainController.instance.circuitComponents.findIndex((cc) => cc === c), component: c }
		})
		idxComps.sort((a, b) => a.idx - b.idx)
		if (components.length < MainController.instance.circuitComponents.length - idxComps[0].idx) {
			for (const idxComp of idxComps) {
				idxComp.component.visualization.insertAfter(
					MainController.instance.circuitComponents.at(-1).visualization
				)
				MainController.instance.circuitComponents.push(
					...MainController.instance.circuitComponents.splice(idxComp.idx, 1)
				)
			}
			Undo.addState()
		}
	}

	public componentsToBackground(components: CircuitComponent[]) {
		if (MainController.instance.circuitComponents.length < 2 || components.length == 0) {
			return
		}
		let idxComps = components.map((c) => {
			return { idx: MainController.instance.circuitComponents.findIndex((cc) => cc === c), component: c }
		})
		idxComps.sort((a, b) => a.idx - b.idx).reverse()
		if (components.length <= idxComps[0].idx) {
			let offset = 0
			for (const idxComp of idxComps) {
				idxComp.component.visualization.insertBefore(MainController.instance.circuitComponents[0].visualization)
				MainController.instance.circuitComponents = MainController.instance.circuitComponents
					.splice(idxComp.idx + offset, 1)
					.concat(MainController.instance.circuitComponents)
				offset++
			}
			Undo.addState()
		}
	}

	/**
	 * Deactivate the mouse and touch panning feature temporary.
	 *
	 * Removes listeners from the canvas.
	 */
	public deactivatePanning() {
		// this listener must be inserted after the normal panZoom listeners --> unregister first
		this.canvas.off("wheel.panZoom", this.movePaper)
		// re-init pan & zoom
		this.canvas.panZoom({
			panning: false, // still enabled for two finger & wheel zoom panning
			pinchZoom: true,
			wheelZoom: true,
			panButton: 99, // deactivates panning using any mouse button
			oneFingerPan: false,
			zoomFactor: this.zoomFactor,
			zoomMin: this.zoomMin,
			zoomMax: this.zoomMax, // dbg; default 5
		})

		// Listens for same event as svg.panzoom.js, but is added thereafter. Thus this gets called after panzoom is
		// done moving the picture.
		// @param {WheelEvent} evt
		this.canvas.on("wheel.panZoom", this.movePaper, this, { passive: true })
	}

	/**
	 * Activate the mouse and touch panning  feature. The initial state is active. Call this function only, if you
	 * previously called {@link deactivatePanning}.
	 *
	 * Adds listeners to the canvas.
	 */
	public activatePanning() {
		// this listener must be inserted after the normal panZoom listeners --> unregister first
		this.canvas.off("wheel.panZoom", this.movePaper)
		// init pan & zoom
		this.canvas.panZoom({
			panning: true,
			pinchZoom: true,
			wheelZoom: true,
			panButton: 2,
			oneFingerPan: false,
			zoomFactor: this.zoomFactor,
			zoomMin: this.zoomMin,
			zoomMax: this.zoomMax,
		})

		// Listens for same event as svg.panzoom.js, but is added thereafter. Thus this gets called after panzoom is
		// done moving the picture.
		// @param {WheelEvent} evt
		this.canvas.on("wheel.panZoom", this.movePaper, this, { passive: true })
	}

	/**
	 * Converts a point from an event to the SVG coordinate system.
	 *
	 * @param {PointerEvent|MouseEvent|TouchEvent} event
	 * @param {boolean} snap if the pointer should check if snapping should be done
	 * @returns {SVG.Point}
	 */
	public static eventToPoint(event: PointerEvent | MouseEvent | TouchEvent, snap: boolean = true): SVG.Point {
		//                touchstart/-move             touchend             mouse*
		//               /----------------\    /-----------------------\    /---\
		// clientXY = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
		let clientXY: SVG.Point
		if (window.TouchEvent && event instanceof TouchEvent) {
			let touch = event.touches.item(0) ?? event.changedTouches.item(0)
			clientXY = new SVG.Point(touch.clientX, touch.clientY)
		} else {
			//@ts-ignore
			clientXY = new SVG.Point(event.clientX, event.clientY)
		}
		if (!CanvasController.instance.invScreenCTM) {
			CanvasController.instance.invScreenCTM = CanvasController.instance.canvas.screenCTM().inverseO()
		}
		let pt = new SVG.Point(clientXY.x, clientXY.y).transformO(CanvasController.instance.invScreenCTM)
		return (event instanceof MouseEvent && event.shiftKey) || !snap ?
				pt
			:	SnapController.instance.snapPoint(pt, undefined)
	}

	/** how the grid should be drawn
	 * @param {number} majorSizecm the distance between two major grid lines in cm
	 * @param {int} majorSubdivisions how many minor grid lines are drawn per major grid line (>=1)
	 */
	public changeGrid(majorSizecm: number, majorSubdivisions: number) {
		this.majorGridSubdivisions = majorSubdivisions
		this.majorGridSizecm = majorSizecm
		let minorGridDistance = majorSizecm / majorSubdivisions
		const snapDistanceNum = new SVG.Number(minorGridDistance, "cm").toString()
		const snapDistancePx = new SVG.Number(minorGridDistance, "cm").convertToUnit("px").value
		const majorDistanceNum = new SVG.Number(majorSizecm, "cm").toString()
		const majorDistancePx = new SVG.Number(majorSizecm, "cm").convertToUnit("px").value

		// change small grid
		const minorGrid = document.getElementById("smallGridPattern")
		minorGrid.setAttribute("width", snapDistanceNum)
		minorGrid.setAttribute("height", snapDistanceNum)
		minorGrid.children[0]?.setAttribute("d", `M ${snapDistancePx} 0 L 0 0 0 ${snapDistancePx}`)

		// change large grid
		const majorGrid = document.getElementById("gridPattern")
		majorGrid.setAttribute("width", majorDistanceNum)
		majorGrid.setAttribute("height", majorDistanceNum)
		majorGrid.children[0]?.setAttribute("width", majorDistanceNum)
		majorGrid.children[0]?.setAttribute("height", majorDistanceNum)
		majorGrid.children[1]?.setAttribute("d", `M ${majorDistancePx} 0 L 0 0 0 ${majorDistancePx}`)
	}

	/**
	 * Called if the window/page is resized.
	 *
	 * Corrects the canvas viewBox. Also calls `#movePaper` to fix the axis.
	 */
	private onResizeCanvas() {
		const newCanvasBounds = this.canvas.node.getBoundingClientRect()
		/** @type {SVG.Box} */
		const oldViewbox: SVG.Box = this.canvas.viewbox() || new SVG.Box()
		const zoom =
			!this.canvasBounds ? 1 : (
				Math.max(
					0.25,
					Math.min(
						10,
						this.canvasBounds.width / oldViewbox.width,
						this.canvasBounds.height / oldViewbox.height
					)
				)
			)

		const newViewbox = new SVG.Box(
			oldViewbox.x,
			oldViewbox.y,
			newCanvasBounds.width / zoom,
			newCanvasBounds.height / zoom
		)
		this.canvas.viewbox(newViewbox)

		let customEvent = new CustomEvent<PanningEventDetail>("", {
			detail: {
				box: newViewbox,
				event: null,
			},
		})
		this.movePaper(customEvent) // fixes axis

		this.canvasBounds = newCanvasBounds
	}

	/**
	 * Move paper/grid and axis on zoom/pan.
	 */
	private movePaper(
		evt: CustomEvent<PanningEventDetail> | CustomEvent<WheelZoomEventDetail> | CustomEvent<PinchZoomEventDetail>
	) {
		if (evt.detail instanceof Object && "level" in evt.detail) {
			this.zoomCurrent = evt.detail.level
		}
		let box: SVG.Box = this.canvas.viewbox()
		this.paper.move(box.x, box.y)
		this.xAxis.attr({ x1: box.x, x2: box.x2 })
		this.yAxis.attr({ y1: box.y, y2: box.y2 })
	}
}
