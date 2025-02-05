import { Modal } from "bootstrap"
import {
	SelectionController,
	Undo,
	ExportController,
	ComponentSaveObject,
	NodeComponent,
	PathComponent,
	NodeSaveObject,
	PathSaveObject,
	WireSaveObject,
	CircuitComponent,
	SelectionMode,
	WireComponent,
	MainController,
	RectangleComponent,
	RectangleSaveObject,
	EllipseSaveObject,
	EllipseComponent,
	PolygonSaveObject,
	PolygonComponent,
	GroupComponent,
	GroupSaveObject,
} from "../internal"

/**
 * Controller for saving and loading the progress in json format
 */
export class SaveController {
	private static _instance: SaveController
	public static get instance(): SaveController {
		if (!SaveController._instance) {
			SaveController._instance = new SaveController()
		}
		return SaveController._instance
	}

	private loadModal: Modal
	private modalElement: HTMLDivElement

	private loadInput: HTMLInputElement
	private loadMessage: HTMLSpanElement

	private loadButton: HTMLButtonElement

	private loadArea: HTMLDivElement
	private loadAreaBackground: HTMLDivElement

	private constructor() {
		this.modalElement = document.getElementById("loadModal") as HTMLDivElement
		this.loadModal = new Modal(this.modalElement)
		this.loadInput = document.getElementById("file-input") as HTMLInputElement
		this.loadMessage = document.getElementById("load-message")
		this.loadButton = document.getElementById("loadJSONButton") as HTMLButtonElement
		this.loadArea = document.getElementById("dragdroparea") as HTMLDivElement
		this.loadAreaBackground = document.getElementById("dragdropbackground") as HTMLDivElement

		const opacity0 = () => {
			this.loadAreaBackground.style.opacity = "0"
		}

		this.loadArea.addEventListener("dragenter", (ev) => {
			this.loadAreaBackground.style.opacity = "0.3"
		})
		this.loadArea.addEventListener("dragleave", opacity0)
		this.loadArea.addEventListener("drop", opacity0)
	}

	save() {
		let components = []
		for (const component of MainController.instance.circuitComponents) {
			components.push(component.toJson())
		}

		ExportController.instance.exportJSON(JSON.stringify(components, null, 4))
	}

	load() {
		//open modal for file selection
		this.loadModal.show()

		const changeText = (() => {
			let file = this.loadInput.files[0]
			if (file) {
				this.loadMessage.textContent = this.loadInput.value.split("\\").pop()
			} else {
				this.loadMessage.textContent = "No file selected"
			}
		}).bind(this)

		const loadFile = (() => {
			let file = this.loadInput.files[0]

			if (file) {
				var reader = new FileReader()
				reader.readAsText(file, "UTF-8")
				reader.onload = (evt) => {
					let inputstring = evt.target.result instanceof ArrayBuffer ? "" : evt.target.result
					this.loadFromJSON(JSON.parse(inputstring), true)
					this.loadModal.hide()
				}
				reader.onerror = (evt) => {
					this.loadMessage.textContent = "error reading file"
				}
			}
		}).bind(this)

		this.loadInput.addEventListener("change", changeText)

		this.loadButton.addEventListener("click", loadFile)

		const hideListener = (() => {
			this.loadInput.removeEventListener("change", changeText)
			this.loadButton.removeEventListener("click", loadFile)
			// "once" is not always supported:
			this.modalElement.removeEventListener("hidden.bs.modal", hideListener)
		}).bind(this)

		this.modalElement.addEventListener("hidden.bs.modal", hideListener, {
			passive: true,
			once: true,
		})
	}

	loadFromJSON(obj: any, selectComponents = false) {
		//delete current state if necessary
		if ((document.getElementById("loadCheckRemove") as HTMLInputElement).checked) {
			SelectionController.instance.selectAll()
			SelectionController.instance.removeSelection()
		}

		let components = []

		if (obj.nodes || obj.paths || obj.lines) {
			for (const node of obj.nodes) {
				components.push(NodeComponent.fromJson(node as NodeSaveObject))
			}

			for (const path of obj.paths) {
				components.push(PathComponent.fromJson(path as PathSaveObject))
			}

			for (const line of obj.lines) {
				components.push(WireComponent.fromJson(line as WireSaveObject))
			}
		} else {
			for (const component of obj) {
				let c = SaveController.fromJson(component)
				components.push(c)
				c.updateTheme()
			}
		}

		if (selectComponents) {
			SelectionController.instance.deactivateSelection()
			SelectionController.instance.activateSelection()
			SelectionController.instance.selectComponents(components, SelectionMode.RESET)
		}
		Undo.addState()
	}

	static fromJson(saveJson: ComponentSaveObject): CircuitComponent {
		switch (saveJson.type) {
			case "node":
				return NodeComponent.fromJson(saveJson as NodeSaveObject)
			case "path":
				return PathComponent.fromJson(saveJson as PathSaveObject)
			case "wire":
				return WireComponent.fromJson(saveJson as WireSaveObject)
			case "rect":
				return RectangleComponent.fromJson(saveJson as RectangleSaveObject)
			case "ellipse":
				return EllipseComponent.fromJson(saveJson as EllipseSaveObject)
			case "polygon":
				return PolygonComponent.fromJson(saveJson as PolygonSaveObject)
			case "group":
				return GroupComponent.fromJson(saveJson as GroupSaveObject)
			default:
				throw new Error("type " + saveJson.type + " not known")
		}
	}
}
