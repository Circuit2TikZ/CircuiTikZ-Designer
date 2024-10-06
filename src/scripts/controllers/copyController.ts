/**
 * @module copyPaste
 */

import { Point } from "@svgdotjs/svg.js"
import { Line, MainController, NodeComponentInstance, PathComponentInstance, SelectionController, Undo } from "../internal"

type Clipboard = {
	nodes: NodeComponentInstance[],
	paths: PathComponentInstance[],
	lines: Line[]
}

/**
 * Class handling copy, paste and cut
 * @class
 */
export class CopyPaste {
	static #clipboard: Clipboard|null = null

	static copy(){
		if (SelectionController.instance.hasSelection()) {
			let nodes = []
			let paths = []
			for (const component of SelectionController.instance.currentlySelectedComponents) {
				let componentObject = component.toJson()
				componentObject.tikzName = ""
				if (component instanceof NodeComponentInstance) {
					nodes.push(componentObject)
				}else{
					paths.push(componentObject)
				}
			}
	
			let lines = []
			for (const line of SelectionController.instance.currentlySelectedLines) {
				lines.push(line.toJson())
			}
	
			CopyPaste.#clipboard = {
				nodes:nodes,
				paths:paths,
				lines:lines,
			}
		}
	}

	static paste(){
		//TODO paste should pick up components instantly and move them to the mouse position
		if (this.#clipboard && Object.keys(CopyPaste.#clipboard).length===0) {
			return
		}
		
		SelectionController.instance.deactivateSelection()
		SelectionController.instance.activateSelection()

		let allComponents = []
		let lines = []

		for (const node of CopyPaste.#clipboard.nodes) {
			allComponents.push(NodeComponentInstance.fromJson(node))
		}
		
		for (const path of CopyPaste.#clipboard.paths) {
			allComponents.push(PathComponentInstance.fromJson(path))
		}

		for (const line of CopyPaste.#clipboard.lines) {
			lines.push(Line.fromJson(line))
		}

		if (allComponents.length>0) {
			SelectionController.instance.selectComponents(allComponents,SelectionController.SelectionMode.RESET)
		}
		if (lines.length>0) {
			SelectionController.instance.selectLines(lines,SelectionController.SelectionMode.RESET)
		}
		//TODO get current mouse position
		SelectionController.instance.moveSelectionTo(new Point(0,0))
		Undo.addState()
	}

	static cut(){
		if (SelectionController.instance.hasSelection()) {
			CopyPaste.copy();
	
			for (const component of SelectionController.instance.currentlySelectedComponents) {
				MainController.controller.removeInstance(component)
			}
			for (const line of SelectionController.instance.currentlySelectedLines) {
				MainController.controller.removeLine(line)
			}
			Undo.addState()
		}
	}
}