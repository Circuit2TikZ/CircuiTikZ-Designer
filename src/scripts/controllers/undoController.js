/**
 * @module undo
 */

import {MainController, NodeComponentInstance, PathComponentInstance, SelectionController, Line} from "../internal";

/**
 * Class handling undo and redo via save states
 * @class
 */
export class Undo {
	static #states = []

	static #currentIndex = -1;

	//TODO discuss id selections should be remembered or not???
	static addState(){
		// get json object
		let nodes = []
		let paths = []
		for (const component of MainController.controller.instances) {
			let componentObject = component.toJson()
			componentObject.selected = SelectionController.controller.isComponentSelected(component)
			if (component instanceof NodeComponentInstance) {
				nodes.push(componentObject)
			}else{
				paths.push(componentObject)
			}
		}

		let lines = []
		for (const line of MainController.controller.lines) {
			let lineObject = line.toJson()
			lineObject.selected = SelectionController.controller.isLineSelected(line)
			lines.push(lineObject)
		}

		let currentState = {
			nodes:nodes,
			paths:paths,
			lines:lines,
		}

		// push state on stack
		Undo.#states = Undo.#states.slice(0,Undo.#currentIndex+1)
		Undo.#states.push(currentState)
		Undo.#currentIndex = Undo.#states.length-1
		console.log("add State");
		
	}

	static undo(){
		Undo.#currentIndex-=1
		if (Undo.#currentIndex<0) {
			Undo.#currentIndex=0
			return
		}
		Undo.#loadState()
		
	}

	static redo(){
		Undo.#currentIndex+=1
		if (Undo.#currentIndex>=Undo.#states.length) {
			Undo.#currentIndex=Undo.#states.length-1
			return
		}
		Undo.#loadState()
	}

	static #loadState(){		
		// remove all components
		while (MainController.controller.instances.length>0) {
			MainController.controller.removeInstance(MainController.controller.instances[0])
		}
		while (MainController.controller.lines.length>0) {
			MainController.controller.removeLine(MainController.controller.lines[0])
		}

		// load state
		let state = Undo.#states[Undo.#currentIndex]		

		let nodes = []
		let paths = []
		let lines = []

		for (const node of state.nodes) {
			let nodeComponent = NodeComponentInstance.fromJson(node)
			if (node.selected) {
				nodes.push(nodeComponent)
			}
		}
		
		for (const path of state.paths) {
			let pathComponent = PathComponentInstance.fromJson(path)
			if (path.selected) {
				paths.push(pathComponent)
			}
		}

		for (const line of state.lines) {
			let lineComponent = Line.fromJson(line)
			if (line.selected) {
				lines.push(lineComponent)
			}
		}

		let allComponents = nodes.concat(paths)
		if (allComponents.length>0) {
			SelectionController.controller.selectComponents(allComponents,SelectionController.SelectionMode.RESET)
		}
		if (lines.length>0) {
			SelectionController.controller.selectLines(lines,SelectionController.SelectionMode.RESET)
		}
	}
}