/**
 * @module saveController
 */

import { Modal } from "bootstrap";
import MainController from "./mainController";
import NodeComponentInstance from "../components/nodeComponentInstance";
import PathComponentInstance from "../components/pathComponentInstance";
import Line from "../lines/line";
import SelectionController from "./selectionController";

/**
 * Controller for saving and loading the progress in json format
 * @class
 */
export default class SaveController {
	/** @type {Modal} */
	#loadModal;
	#modalElement

	/** @type {HTMLInputElement} */
	#loadInput;
	/** @type {HTMLSpanElement} */
	#loadMessage

	/** @type {HTMLButtonElement} */
	#loadButton

	/** @type {HTMLDivElement} */
	#loadArea
	/** @type {HTMLDivElement} */
	#loadAreaBackground

	constructor() {
		this.#modalElement = document.getElementById("loadModal")
		this.#loadModal = new Modal(this.#modalElement)
		this.#loadInput = document.getElementById("file-input")
		this.#loadMessage = document.getElementById("load-message")
		this.#loadButton = document.getElementById("loadJSONButton")
		this.#loadArea = document.getElementById("dragdroparea")
		this.#loadAreaBackground = document.getElementById("dragdropbackground")
		
		const opacity0 = ()=>{this.#loadAreaBackground.style.opacity = "0"}
		
		this.#loadArea.addEventListener("dragenter",(ev)=>{
			this.#loadAreaBackground.style.opacity = "0.3"
		})
		this.#loadArea.addEventListener("dragleave",opacity0)
		this.#loadArea.addEventListener("drop",opacity0)
	}

	save(){
		let nodes = []
		let paths = []
		for (const component of MainController.controller.instances) {
			if (component instanceof NodeComponentInstance) {
				nodes.push(component.toJson())
			}else{
				paths.push(component.toJson())
			}
		}

		let lines = []
		for (const line of MainController.controller.lines) {
			lines.push(line.toJson())
		}

		let all = {nodes:nodes,paths:paths,lines:lines}

		MainController.controller.exportController.exportJSON(JSON.stringify(all,null,4))
	}

	load(){
		//open modal for file selection
		this.#loadModal.show()

		const changeText = (()=>{			
			
			let file = this.#loadInput.files[0];
			if (file) {
				this.#loadMessage.textContent = this.#loadInput.value.split("\\").pop()
			}else{
				this.#loadMessage.textContent = "No file selected"
			}
		}).bind(this);

		const loadFile = (()=>{			
			let file = this.#loadInput.files[0];

			if (file) {
				var reader = new FileReader();
				reader.readAsText(file, "UTF-8");
				reader.onload = (evt) => {
					this.#loadFromText(evt.target.result);
					this.#loadModal.hide()
				}
				reader.onerror = (evt) => {
					this.#loadMessage.textContent = "error reading file";
				}
			}

		}).bind(this);

		this.#loadInput.addEventListener("change",changeText)

		this.#loadButton.addEventListener("click",loadFile)

		const hideListener = (() => {
			this.#loadInput.removeEventListener("change", changeText);
			this.#loadButton.removeEventListener("click", loadFile);
			// "once" is not always supported:
			this.#modalElement.removeEventListener("hidden.bs.modal", hideListener);
		}).bind(this);

		this.#modalElement.addEventListener("hidden.bs.modal", hideListener, {
			passive: true,
			once: true,
		});
	}

	#loadFromText(text){
		//delete current state if necessary		
		if (document.getElementById("loadCheckRemove").checked) {
			SelectionController.controller.selectAll()
			SelectionController.controller.removeSelection()
		}

		// load data from json
		let obj = JSON.parse(text)

		let nodes = []
		let paths = []
		let lines = []

		for (const node of obj.nodes) {
			nodes.push(NodeComponentInstance.fromJson(node))
		}
		
		for (const path of obj.paths) {
			paths.push(PathComponentInstance.fromJson(path))
		}

		for (const line of obj.lines) {
			lines.push(Line.fromJson(line))
		}
		
		SelectionController.controller.selectComponents(nodes.concat(paths),SelectionController.SelectionMode.RESET)
		SelectionController.controller.selectLines(lines,SelectionController.SelectionMode.RESET)
	}
}