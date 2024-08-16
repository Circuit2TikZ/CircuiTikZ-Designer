/**
 * @module undoController
 */

import MainController from "./mainController";
import NodeComponentInstance from "../components/nodeComponentInstance";
import PathComponentInstance from "../components/pathComponentInstance";
import Line from "../lines/line";
import SelectionController from "./selectionController";

/**
 * Controller holding selection information and handling selecting/deselecting
 * @class
 */
export default class UndoController {
	/**
	 * Static variable holding the instance.
	 * @type {UndoController}
	 */
	static controller;

	/**
	 * the 
	 */
	#states = []

	#currentIndex = -1;

	constructor(){
		UndoController.controller=this;
	}

	addState(){
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
		this.#states = this.#states.slice(0,this.#currentIndex+1)
		this.#states.push(currentState)
		this.#currentIndex = this.#states.length-1
		console.log("add state!");
	}

	undo(){
		this.#currentIndex-=1
		if (this.#currentIndex<0) {
			this.#currentIndex=0
			return
		}
		this.#loadState()
		console.log("undo!");
		
	}

	redo(){
		this.#currentIndex+=1
		if (this.#currentIndex>=this.#states.length) {
			this.#currentIndex=this.#states.length-1
			return
		}
		this.#loadState()
		console.log("redo!");
	}

	#loadState(){
		// remove all components
		while (MainController.controller.instances.length>0) {
			MainController.controller.removeInstance(MainController.controller.instances.pop())
		}
		while (MainController.controller.lines.length>0) {
			MainController.controller.removeLine(MainController.controller.lines.pop())
		}

		// load state
		let state = this.#states[this.#currentIndex]

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
			let lineComponent = PathComponentInstance.fromJson(line)
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