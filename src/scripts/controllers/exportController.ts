import { Modal, Tooltip } from "bootstrap"
import { SelectionController, MainController, defaultStroke, defaultFill, TextProperty } from "../internal"
import FileSaver from "file-saver"
import * as prettier from "prettier"
import * as SVG from "@svgdotjs/svg.js"
const parserXML = require("@prettier/plugin-xml").default

/**
 * Contains export functions and controls the "exportModal" (~dialog).
 * @class
 */
export class ExportController {
	private static _instance: ExportController
	public static get instance(): ExportController {
		if (!ExportController._instance) {
			ExportController._instance = new ExportController()
		}
		return ExportController._instance
	}

	private modalElement: HTMLDivElement
	private modal: Modal
	private heading: HTMLHeadingElement
	private exportedContent: HTMLTextAreaElement
	private fileBasename: HTMLInputElement
	private fileExtension: HTMLInputElement
	private fileExtensionDropdown: HTMLUListElement
	private copyButton: HTMLDivElement
	private saveButton: HTMLButtonElement

	private copyTooltip: Tooltip

	private defaultDisplay: string

	private usedIDs: Map<string, number>
	public createExportID(prefix = "N"): string {
		let currentID: number
		if (this.usedIDs.has(prefix)) {
			currentID = this.usedIDs.get(prefix)
			currentID++
		} else {
			currentID = 1
		}
		while (this.isIDUsed(prefix + currentID)) currentID++
		this.usedIDs.set(prefix, currentID)
		return prefix + currentID
	}

	private isIDUsed(id: string): boolean {
		for (const component of MainController.instance.circuitComponents) {
			// check if another component with the same name already exists
			if ("name" in component) {
				let name = component.name as TextProperty
				if (name.value == id) {
					return true
				}
			}
		}
		return false
	}

	/**
	 * Init the ExportController
	 */
	private constructor() {
		this.modalElement = document.getElementById("exportModal") as HTMLDivElement
		this.modal = new Modal(this.modalElement)
		this.heading = document.getElementById("exportModalLabel") as HTMLHeadingElement
		this.exportedContent = document.getElementById("exportedContent") as HTMLTextAreaElement
		this.fileBasename = document.getElementById("exportModalFileBasename") as HTMLInputElement
		this.fileExtension = document.getElementById("exportModalFileExtension") as HTMLInputElement
		this.fileExtensionDropdown = document.getElementById("exportModalFileExtensionDropdown") as HTMLUListElement
		this.copyButton = document.getElementById("copyExportedContent") as HTMLDivElement
		this.saveButton = document.getElementById("exportModalSave") as HTMLButtonElement

		this.defaultDisplay = this.exportedContent.parentElement.style.display

		let copyButtonDefaultTooltipText = "Copy to clipboard!"
		this.copyButton.addEventListener("hidden.bs.tooltip", (evt) => {
			this.copyButton.setAttribute("data-bs-title", copyButtonDefaultTooltipText)
			this.copyTooltip.dispose()
			this.copyTooltip = new Tooltip(this.copyButton)
		})
		this.copyButton.setAttribute("data-bs-toggle", "tooltip")
		this.copyButton.setAttribute("data-bs-title", copyButtonDefaultTooltipText)
		this.copyTooltip = new Tooltip(this.copyButton)

		this.usedIDs = new Map<string, number>()
	}

	exportJSON(text: string) {
		this.heading.textContent = "Save JSON"

		// create extension select list
		const extensions = [".json", ".txt"]

		this.exportedContent.rows = Math.max(text.split("\n").length, 2)
		this.exportedContent.value = text

		this.export(extensions)
	}

	/**
	 * Shows the exportModal with the CitcuiTikZ code.
	 */
	exportCircuiTikZ() {
		this.heading.innerHTML = "Export CircuiTi<i>k</i>Z code"
		this.exportedContent.parentElement.style.display = this.defaultDisplay
		// create extension select list
		const extensions = [".tikz", ".tex", ".pgf"]

		// actually export/create the string
		{
			let circuitElements = []
			let requiredTikzLibraries: Set<string> = new Set<string>()
			for (const circuitElement of MainController.instance.circuitComponents) {
				circuitElement.requiredTikzLibraries().forEach((item) => requiredTikzLibraries.add(item))
				circuitElements.push("\t" + circuitElement.toTikzString())
			}
			let libraryStr =
				requiredTikzLibraries.size > 0 ?
					"\\usetikzlibrary{" + requiredTikzLibraries.values().toArray().join(", ") + "}"
				:	""

			let arr = ["\\begin{tikzpicture}", "\t% Paths, nodes and wires:", ...circuitElements, "\\end{tikzpicture}"]
			if (libraryStr) {
				arr = [libraryStr].concat(arr)
			}
			this.exportedContent.rows = arr.length
			this.exportedContent.value = arr.join("\n")
		}
		this.usedIDs.clear()
		this.export(extensions)
	}

	/**
	 * Shows the exportModal with the SVG code.
	 */
	exportSVG() {
		this.heading.textContent = "Export SVG"
		this.exportedContent.parentElement.style.display = this.defaultDisplay
		// prepare selection and bounding box
		SelectionController.instance.selectAll()
		SelectionController.instance.deactivateSelection()

		let colorTheme = MainController.instance.darkMode
		MainController.instance.darkMode = false
		MainController.instance.updateTheme()

		//Get the canvas
		let svgObj = new SVG.Svg()
		svgObj.node.style.fontSize = "10pt"
		svgObj.node.style.overflow = "visible"

		// get all used node/symbol names
		let defsMap: Map<string, SVG.Element> = new Map<string, SVG.Element>()
		let components: SVG.Element[] = []
		for (const instance of MainController.instance.circuitComponents) {
			components.push(instance.toSVG(defsMap))
		}

		// add to defs
		if (defsMap.size > 0) {
			const defs = new SVG.Defs()
			for (const element of defsMap) {
				defs.add(element[1])
			}
			svgObj.add(defs)
		}

		for (const component of components) {
			svgObj.add(component)
		}

		//basic cleanup of components used to improve dragging
		for (const removeElement of svgObj
			.find('[fill="none"][stroke="transparent"]')
			.concat(svgObj.find('[fill="transparent"][stroke="none"]'))) {
			removeElement.remove()
		}
		for (const removeClass of svgObj.find(".draggable")) {
			removeClass.removeClass("draggable")
		}

		// bounding box to include all elements
		let bbox = svgObj.bbox()
		if (bbox) {
			//make bbox 2px larger in every direction to not cut of tiny bits of some objects
			bbox.x -= 2
			bbox.y -= 2
			bbox.width += 4
			bbox.height += 4
			svgObj.viewbox(bbox)
		}

		// convert to text and make pretty
		let tempDiv = document.createElement("div")
		tempDiv.appendChild(svgObj.node)
		tempDiv.innerHTML = tempDiv.innerHTML.replaceAll(defaultStroke, "#000").replaceAll(defaultFill, "#fff")
		prettier
			.format(tempDiv.innerHTML.replaceAll("<br>", "<br/>"), {
				parser: "xml",
				plugins: [parserXML],
				tabWidth: 4,
				singleAttributePerLine: true,
				xmlWhitespaceSensitivity: "preserve",
			})
			.then((textContent) => {
				this.exportedContent.rows = textContent.split("\n").length
				this.exportedContent.value = textContent
				const extensions = [".svg", ".txt"]
				this.export(extensions)
				SelectionController.instance.activateSelection()
				tempDiv.remove()
			})
		MainController.instance.darkMode = colorTheme
		MainController.instance.updateTheme()
	}

	private export(extensions: string[]) {
		// copy text and adjust tooltip for feedback
		const copyText = () => {
			navigator.clipboard.writeText(this.exportedContent.value).then(() => {
				this.copyButton.setAttribute("data-bs-title", "Copied!")
				this.copyTooltip.dispose()
				this.copyTooltip = new Tooltip(this.copyButton)
				this.copyTooltip.show()
			})
		}
		// create listeners
		const saveFile = (() => {
			FileSaver.saveAs(
				new Blob([this.exportedContent.value], { type: "text/x-tex;charset=utf-8" }),
				(this.fileBasename.value.trim() || "Circuit") + this.fileExtension.value
			)
		}).bind(this)
		const hideListener = (() => {
			this.exportedContent.value = "" // free memory
			this.copyButton.removeEventListener("click", copyText)
			this.saveButton.removeEventListener("click", saveFile)
			this.fileExtensionDropdown.replaceChildren()
			// "once" is not always supported:
			this.modalElement.removeEventListener("hidden.bs.modal", hideListener)
		}).bind(this)

		this.modalElement.addEventListener("hidden.bs.modal", hideListener, {
			passive: true,
			once: true,
		})

		// create extension select list
		this.fileExtension.value = extensions[0]
		this.fileExtensionDropdown.replaceChildren(
			...extensions.map((ext) => {
				const link = document.createElement("a")
				link.textContent = ext
				link.classList.add("dropdown-item")
				link.addEventListener("click", () => (this.fileExtension.value = ext), {
					passive: true,
				})
				const listElement = document.createElement("li")
				listElement.appendChild(link)
				return listElement
			})
		)

		// add listeners & show modal
		this.copyButton.addEventListener("click", copyText, { passive: true })
		this.saveButton.addEventListener("click", saveFile, { passive: true })

		this.modal.show()
	}
}
