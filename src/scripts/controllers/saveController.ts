import { Modal } from "bootstrap"
import {
	SelectionController,
	Undo,
	ExportController,
	ComponentSaveObject,
	CircuitComponent,
	SelectionMode,
	MainController,
} from "../internal"
import { version } from "../../../package.json"

// bump this if something is removed or adjusted in how the save file is formatted. (No change necessary if something is added)
export let currentSaveVersion = "0.1"

export type SaveFileFormat = {
	version: string
	components: ComponentSaveObject[]
}

export let emtpySaveState: SaveFileFormat = {
	version: currentSaveVersion,
	components: [],
}

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

	public currentlyLoadedSaveVersion: string = currentSaveVersion

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
		let componentArray = []
		for (const component of MainController.instance.circuitComponents) {
			componentArray.push(component.toJson())
		}
		let data: SaveFileFormat = { version: currentSaveVersion, components: componentArray }

		ExportController.instance.exportJSON(JSON.stringify(data, null, 4))
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
					const input = JSON.parse(inputstring)
					if (!("version" in input)) {
						alert(
							"You are using an old version of the json save file format. Please override all files exported from Circuitikz Designer version 0.6 and older by reexporting your circuit to json to update them to the newest json save file format version (currently: " +
								currentSaveVersion +
								" for Circuitikz Designer version " +
								version +
								"). Old versions might be deprecated at any time and therefore might not properly load."
						)
					}
					this.loadFromJSON(input, true)
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

	loadFromJSON(saveFile: SaveFileFormat, selectComponents = false) {
		//delete current state if necessary
		if ((document.getElementById("loadCheckRemove") as HTMLInputElement).checked) {
			SelectionController.instance.selectAll()
			SelectionController.instance.removeSelection()
		}

		let components = []

		if (!("version" in saveFile)) {
			// old file format
			this.currentlyLoadedSaveVersion = ""
			//@ts-ignore
			for (const component of saveFile) {
				let c = SaveController.fromJson(component)
				if (c) {
					components.push(c)
				}
			}
		} else {
			this.currentlyLoadedSaveVersion = saveFile.version

			for (const component of saveFile.components) {
				let c = SaveController.fromJson(component)
				if (c) {
					components.push(c)
				}
			}
		}

		if (selectComponents) {
			SelectionController.instance.deactivateSelection()
			SelectionController.instance.activateSelection()
			SelectionController.instance.selectComponents(components, SelectionMode.RESET)
		}
		Undo.addState()
		this.currentlyLoadedSaveVersion = currentSaveVersion
	}

	static fromJson(saveJson: ComponentSaveObject): CircuitComponent {
		return CircuitComponent.fromJson(saveJson)
	}
}
