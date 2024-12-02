import * as SVG from "@svgdotjs/svg.js"
import {
	ButtonGridProperty,
	CanvasController,
	CircuitComponent,
	ComponentSaveObject,
	MainController,
	SaveController,
	SectionHeaderProperty,
	SelectionController,
	SelectionMode,
	SnappingInfo,
} from "../internal"
import { rectRectIntersection } from "../utils/selectionHelper"

export type GroupSaveObject = ComponentSaveObject & {
	components: ComponentSaveObject[]
}

export class GroupComponent extends CircuitComponent {
	public groupedComponents: CircuitComponent[] = []

	constructor(components: CircuitComponent[]) {
		super()
		MainController.instance.circuitComponents.pop()
		this.displayName = "Group"
		this.snappingPoints = []
		this.groupedComponents.push(...components)
		let firstIndex = -1
		for (const component of components) {
			const idx = MainController.instance.circuitComponents.indexOf(component)
			firstIndex = firstIndex < 0 ? idx : firstIndex
			MainController.instance.circuitComponents.splice(idx, 1)
			component.parentGroup = this
			component.viewSelected(false)
		}

		MainController.instance.circuitComponents.splice(firstIndex, 0, this)

		this.propertiesHTMLRows.push(new SectionHeaderProperty("Grouping").buildHTML())
		let grouping = new ButtonGridProperty(1, [["Ungroup", ""]], [(ev) => this.ungroup()])
		this.propertiesHTMLRows.push(grouping.buildHTML())

		this.visualization = CanvasController.instance.canvas.group()
		this.update()
		SelectionController.instance.selectComponents([this], SelectionMode.RESET)
		this.snappingPoints = this.groupedComponents
			.map((component) => component.snappingPoints)
			.reduce((prev, current) => {
				return prev.concat(current)
			}, [])
	}

	public static group(circuitComponents: CircuitComponent[]) {
		new GroupComponent(circuitComponents)
	}

	public ungroup() {
		const idx = MainController.instance.circuitComponents.indexOf(this)
		MainController.instance.circuitComponents.splice(idx, 1, ...this.groupedComponents)
		this.viewSelected(false)
		this.groupedComponents.forEach((component) => {
			component.parentGroup = null
		})
		SelectionController.instance.selectComponents(this.groupedComponents, SelectionMode.RESET)
		this.visualization.remove()
	}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		return rectRectIntersection(this._bbox, selectionRectangle)
	}

	public getSnappingInfo(): SnappingInfo {
		//TODO
		return { additionalSnappingPoints: [], trackedSnappingPoints: this.snappingPoints }
	}
	public draggable(drag: boolean): void {
		//Not needed; dragging handled by child components
	}
	public resizable(resize: boolean): void {
		//No resizing for now
	}
	protected recalculateResizePoints(): void {
		//No resizing for now
	}
	public moveTo(position: SVG.Point): void {
		const rel = position.sub(this.position)
		for (const component of this.groupedComponents) {
			component.moveRel(rel)
		}
		this.update()
	}
	public rotate(angleDeg: number): void {
		throw new Error("Method not implemented.")
	}
	public flip(horizontal: boolean): void {
		throw new Error("Method not implemented.")
	}
	protected update(): void {
		this._bbox = undefined
		for (const component of this.groupedComponents) {
			if (this._bbox) {
				this._bbox = this._bbox.merge(component.bbox)
			} else {
				this._bbox = component.bbox
			}
		}
		this.position = new SVG.Point(this._bbox.cx, this._bbox.cy)

		this.relPosition = this.position.sub(new SVG.Point(this._bbox.x, this._bbox.y))
		this.recalculateSelectionVisuals()
	}
	protected recalculateSelectionVisuals(): void {
		if (this.selectionElement) {
			let box = this.bbox

			this.selectionElement.size(box.w, box.h)
			this.selectionElement.center(this.position.x, this.position.y)
		}
	}
	public toJson(): GroupSaveObject {
		let componentSaveObjects: ComponentSaveObject[] = []
		for (const component of this.groupedComponents) {
			componentSaveObjects.push(component.toJson())
		}
		let saveObject: GroupSaveObject = {
			type: "group",
			components: componentSaveObjects,
		}

		return saveObject
	}
	public static fromJson(saveObject: GroupSaveObject): GroupComponent {
		let components: CircuitComponent[] = []
		for (const saveObj of saveObject.components) {
			components.push(SaveController.fromJson(saveObj))
		}
		return new GroupComponent(components)
	}
	public toTikzString(): string {
		let outStr = []
		for (const component of this.groupedComponents) {
			outStr.push(component.toTikzString())
		}
		return outStr.join("\n")
	}
	public copyForPlacement(): CircuitComponent {
		//not needed
		return
	}
	public remove(): void {
		for (const component of this.groupedComponents) {
			component.remove()
		}
		MainController.instance.circuitComponents.splice(MainController.instance.circuitComponents.indexOf(this), 1)
	}
	public placeMove(pos: SVG.Point, ev?: Event): void {
		//not needed
		return
	}
	public placeStep(pos: SVG.Point, ev?: Event): boolean {
		//not needed
		return
	}
	public placeFinish(): void {
		//not needed
		return
	}
	public updateLabelPosition(): void {
		//not needed
		return
	}
}
