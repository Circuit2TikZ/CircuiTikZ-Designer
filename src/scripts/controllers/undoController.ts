/**
 * @module undo
 */

import {MainController, NodeComponentInstance, PathComponentInstance, SelectionController, Line, CanvasController} from "../internal";

/**
 * Class handling undo and redo via save states
 * @class
 */
export class Undo {
	static #states = []

	static #currentIndex = -1;

	//TODO discuss if selections should be remembered or not???
	static addState(){
		// get json object
		let currentState = []
		for (const component of CanvasController.controller.canvas.children()) {
			if (component instanceof NodeComponentInstance || component instanceof PathComponentInstance) {
				let componentObject = component.toJson()
				componentObject.selected = SelectionController.controller.isComponentSelected(component)
				currentState.push(componentObject)
			}else if(component instanceof Line){
				let componentObject = component.toJson()
				componentObject.selected = SelectionController.controller.isLineSelected(component)
				currentState.push(componentObject)
			}
		}

		// push state on stack
		Undo.#states = Undo.#states.slice(0,Undo.#currentIndex+1)
		Undo.#states.push(currentState)
		Undo.#currentIndex = Undo.#states.length-1
	}

	static getCurrentState(){
		return Undo.#states[Undo.#currentIndex]
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

		let allComponents = []
		let lines = []

		for (const component of state) {
			if (component.type==="line") {
				let lineComponent = Line.fromJson(component)
				if (component.selected) {
					lines.push(lineComponent)
				}
			}else if(component.type==="node"){
				let nodeComponent = NodeComponentInstance.fromJson(component)
				if (component.selected) {
					allComponents.push(nodeComponent)
				}
			}else if(component.type==="path"){
				let pathComponent = PathComponentInstance.fromJson(component)
				if (component.selected) {
					allComponents.push(pathComponent)
				}
			}
		}

		if (allComponents.length>0) {
			SelectionController.controller.selectComponents(allComponents,SelectionController.SelectionMode.RESET)
		}
		if (lines.length>0) {
			SelectionController.controller.selectLines(lines,SelectionController.SelectionMode.RESET)
		}
	}
}