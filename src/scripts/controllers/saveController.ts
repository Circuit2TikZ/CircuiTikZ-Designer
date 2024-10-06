/**
 * @module saveController
 */

import { Modal } from "bootstrap";
import { MainController,NodeComponentInstance,PathComponentInstance,Line,SelectionController,Undo, CanvasController, ExportController, ComponentSaveObject, NodeComponent, PathComponent, NodeSaveObject, PathSaveObject, LineSaveObject, CircuitComponent } from "../internal";

/**
 * Controller for saving and loading the progress in json format
 * @class
 */
export class SaveController {
	private static _instance: SaveController;
	public static get instance(): SaveController {
		if (!SaveController._instance) {
			SaveController._instance = new SaveController()
		}
		return SaveController._instance;
	}

	#loadModal: Modal;
	#modalElement: HTMLDivElement

	#loadInput: HTMLInputElement;
	#loadMessage: HTMLSpanElement

	#loadButton: HTMLButtonElement

	#loadArea: HTMLDivElement
	#loadAreaBackground: HTMLDivElement

	private constructor() {
		this.#modalElement = document.getElementById("loadModal") as HTMLDivElement
		this.#loadModal = new Modal(this.#modalElement)
		this.#loadInput = document.getElementById("file-input") as HTMLInputElement
		this.#loadMessage = document.getElementById("load-message")
		this.#loadButton = document.getElementById("loadJSONButton") as HTMLButtonElement
		this.#loadArea = document.getElementById("dragdroparea") as HTMLDivElement
		this.#loadAreaBackground = document.getElementById("dragdropbackground") as HTMLDivElement
		
		const opacity0 = ()=>{this.#loadAreaBackground.style.opacity = "0"}
		
		this.#loadArea.addEventListener("dragenter",(ev)=>{
			this.#loadAreaBackground.style.opacity = "0.3"
		})
		this.#loadArea.addEventListener("dragleave",opacity0)
		this.#loadArea.addEventListener("drop",opacity0)
	}

	save(){
		let components = []
		for (const component of CanvasController.instance.canvas.children()) {
			if (component instanceof Line || component instanceof NodeComponentInstance || component instanceof PathComponentInstance) {
				components.push(component.toJson())
			}
		}

		ExportController.instance.exportJSON(JSON.stringify(components,null,4))
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
					this.loadFromJSON(JSON.parse(evt.target.result), true);
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

	loadFromJSON(obj, selectComponents=false){
		//delete current state if necessary		
		if (document.getElementById("loadCheckRemove").checked) {
			SelectionController.instance.selectAll()
			SelectionController.instance.removeSelection()
		}
		
		let nodes = []
		let paths = []
		let lines = []

		if (obj.nodes || obj.paths || obj.lines) {
			for (const node of obj.nodes) {
				nodes.push(NodeComponentInstance.fromJson(node))
			}
			
			for (const path of obj.paths) {
				paths.push(PathComponentInstance.fromJson(path))
			}
	
			for (const line of obj.lines) {
				lines.push(Line.fromJson(line))
			}
		}else{
			for (const component of obj) {
				if (component.type==="wire") {
					lines.push(Line.fromJson(component))
				}else if(component.type==="node"){
					nodes.push(NodeComponentInstance.fromJson(component))
				}else if(component.type==="path"){
					paths.push(PathComponentInstance.fromJson(component))
				}
			}
		}
		
		if (selectComponents) {
			SelectionController.instance.deactivateSelection()
			SelectionController.instance.activateSelection()
			SelectionController.instance.selectComponents(nodes.concat(paths),SelectionController.SelectionMode.RESET)
			SelectionController.instance.selectLines(lines,SelectionController.SelectionMode.RESET)
		}
		Undo.addState()
	}

	static fromJson(saveJson:ComponentSaveObject): CircuitComponent{
		switch (saveJson.type) {
			case "node":
				return NodeComponent.fromJson(saveJson as NodeSaveObject)
			case "path":
				return PathComponent.fromJson(saveJson as PathSaveObject)
			case "wire":
				return Line.fromJson(saveJson as LineSaveObject)
			default:
				break;
		}
	}
}