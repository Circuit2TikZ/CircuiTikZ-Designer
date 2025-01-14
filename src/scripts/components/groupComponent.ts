import * as SVG from "@svgdotjs/svg.js"
import {
	ButtonGridProperty,
	CircuitComponent,
	ComponentSaveObject,
	MainController,
	SaveController,
	SectionHeaderProperty,
	SelectionController,
	SelectionMode,
	SnappingInfo,
	Undo,
} from "../internal"
import { rectRectIntersection } from "../utils/selectionHelper"

export type GroupSaveObject = ComponentSaveObject & {
	components: ComponentSaveObject[]
}

export class GroupComponent extends CircuitComponent {
	public groupedComponents: CircuitComponent[] = []

	constructor(components: CircuitComponent[]) {
		super()
		MainController.instance.circuitComponents.pop() // add later at specific index instead
		this.displayName = "Group"
		this.snappingPoints = []
		this.groupedComponents.push(...components)
		const idx = this.visualization.parent().index(components[0].visualization)
		this.visualization.parent().add(this.visualization, idx)
		let firstIndex = -1
		for (const component of components) {
			const idx = MainController.instance.circuitComponents.indexOf(component)
			firstIndex = firstIndex < 0 ? idx : firstIndex
			MainController.instance.circuitComponents.splice(idx, 1)
			component.parentGroup = this
			component.viewSelected(false)
			this.visualization.add(component.visualization)
		}

		MainController.instance.circuitComponents.splice(firstIndex, 0, this) // added here

		this.propertiesHTMLRows.push(new SectionHeaderProperty("Grouping").buildHTML())
		let grouping = new ButtonGridProperty(1, [["Ungroup", ""]], [(ev) => this.ungroup()])
		this.propertiesHTMLRows.push(grouping.buildHTML())

		this.update()
		SelectionController.instance.selectComponents([this], SelectionMode.RESET)
		this.snappingPoints = this.groupedComponents.map((component) => component.snappingPoints).flat()
	}

	public static group(circuitComponents: CircuitComponent[]) {
		new GroupComponent(circuitComponents)
		Undo.addState()
	}

	public ungroup() {
		const idx = MainController.instance.circuitComponents.indexOf(this)
		MainController.instance.circuitComponents.splice(idx, 1, ...this.groupedComponents)
		const parent = this.visualization.parent()
		const currentIdx = parent.index(this.visualization)
		for (let index = 0; index < this.groupedComponents.length; index++) {
			const component = this.groupedComponents[index]
			component.parentGroup = null
			parent.add(component.visualization, currentIdx + index)
		}
		SelectionController.instance.selectComponents(this.groupedComponents, SelectionMode.RESET)
		this.groupedComponents = []
		this.remove()
		Undo.addState()
	}

	public isInsideSelectionRectangle(selectionRectangle: SVG.Box): boolean {
		return rectRectIntersection(this._bbox, selectionRectangle)
	}

	public getSnappingInfo(): SnappingInfo {
		return { additionalSnappingPoints: [], trackedSnappingPoints: this.snappingPoints }
	}
	public draggable(drag: boolean): void {
		for (const element of this.groupedComponents) {
			element.draggable(drag)
		}
	}
	public resizable(resize: boolean): void {
		for (const element of this.groupedComponents) {
			element.resizable(resize)
		}
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
		for (const element of this.groupedComponents) {
			element.moveTo(element.position.rotate(angleDeg, this.position))
			element.rotate(angleDeg)
		}
		this.update()
	}
	public flip(horizontal: boolean): void {
		for (const element of this.groupedComponents) {
			const moveRel = element.position
				.sub(this.position)
				.mul(new SVG.Point(horizontal ? 0 : -2, horizontal ? -2 : 0))
			element.moveRel(moveRel)
			element.flip(horizontal)
		}
		this.update()
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
	public toSVG(defs: Map<string, SVG.Element>): SVG.Element {
		let group = new SVG.G()
		for (const element of this.groupedComponents) {
			group.add(element.toSVG(defs))
		}
		return group
	}
	public copyForPlacement(): CircuitComponent {
		//not needed
		return
	}
	public remove(): void {
		this.viewSelected(false)
		this.selectionElement?.remove()
		for (const component of this.groupedComponents) {
			component.remove()
		}
		this.visualization.remove()
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
