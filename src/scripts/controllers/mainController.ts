import * as SVG from "@svgdotjs/svg.js"
import { Button as _bootstrapButton, Collapse as _bootstrapCollapse, Offcanvas, Tooltip, Modal } from "bootstrap"
import "../utils/impSVGNumber"
import { waitForElementLoaded } from "../utils/domWatcher"
import hotkeys from "hotkeys-js"
import { version } from "../../../package.json"

import {
	CanvasController,
	SnapCursorController,
	ExportController,
	SelectionController,
	SaveController,
	Undo,
	CopyPaste,
	PropertyController,
	CircuitComponent,
	ComponentPlacer,
	NodeSymbolComponent,
	PathSymbolComponent,
	WireComponent,
	ComponentSymbol,
	ComponentSaveObject,
	EraseController,
	RectangleComponent,
	EllipseComponent,
	defaultStroke,
	defaultFill,
	PolygonComponent,
	GroupSaveObject,
	memorySizeOf,
	SaveFileFormat,
	emtpySaveState,
	currentSaveVersion,
} from "../internal"

type TabState = {
	id: number
	open: string
	data: SaveFileFormat
	settings: CanvasSettings
}

export type CanvasSettings = {
	gridVisible?: boolean
	majorGridSizecm?: number
	majorGridSubdivisions?: number
	viewBox?: SVG.Box
	viewZoom?: number
}

export enum Modes {
	DRAG_PAN,
	COMPONENT,
	ERASE,
}

// TODO Test
// TODO redo comments

export class MainController {
	private static _instance: MainController
	public static get instance(): MainController {
		if (!MainController._instance) {
			MainController._instance = new MainController()
		}
		return MainController._instance
	}

	// controllers
	canvasController: CanvasController

	symbolsSVG: SVG.Svg
	symbols: ComponentSymbol[]

	public darkMode = true
	private darkModeLast = true
	private currentTheme = "dark"

	private tabID = -1

	mode = Modes.DRAG_PAN

	private modeSwitchButtons = {
		modeDragPan: null,
		modeDrawLine: null,
		modeEraser: null,
	}

	initPromise: Promise<any>
	isInitDone: boolean = false

	circuitComponents: CircuitComponent[] = []
	// instances: ComponentInstance[] = [];
	// lines: Line[] = [];

	static appVersion = "0.0.0"

	isMac = false
	selectionController: SelectionController

	broadcastChannel: BroadcastChannel

	/**
	 * Init the app.
	 */
	private constructor() {
		MainController._instance = this
		this.isMac = window.navigator.userAgent.toUpperCase().indexOf("MAC") >= 0
		this.broadcastChannel = new BroadcastChannel("circuitikz-designer")

		// dark mode init
		const htmlElement = document.documentElement
		const switchElement = document.getElementById("darkModeSwitch") as HTMLInputElement
		const defaultTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
		this.currentTheme = localStorage.getItem("circuitikz-designer-theme") || defaultTheme
		htmlElement.setAttribute("data-bs-theme", this.currentTheme)
		this.darkModeLast = false
		this.darkMode = this.currentTheme === "dark"
		switchElement.checked = this.darkMode

		let mathJaxPromise = this.loadMathJax()
		let canvasPromise = this.initCanvas()
		let symbolsDBPromise = this.initSymbolDB()
		let fontPromise = document.fonts.load("1em CMU Serif")

		MainController.appVersion = version
		document.addEventListener("DOMContentLoaded", () => {
			for (const element of document.getElementsByClassName("version")) {
				element.textContent = "v" + version
			}
		})

		this.initModeButtons()

		this.updateTooltips()

		// init exporting
		ExportController.instance
		const exportCircuiTikZButton: HTMLButtonElement = document.getElementById(
			"exportCircuiTikZButton"
		) as HTMLButtonElement
		exportCircuiTikZButton.addEventListener(
			"click",
			ExportController.instance.exportCircuiTikZ.bind(ExportController.instance),
			{
				passive: true,
			}
		)

		const exportSVGButton: HTMLButtonElement = document.getElementById("exportSVGButton") as HTMLButtonElement
		exportSVGButton.addEventListener("click", ExportController.instance.exportSVG.bind(ExportController.instance), {
			passive: true,
		})

		// init save and load
		SaveController.instance
		const saveButton: HTMLButtonElement = document.getElementById("saveButton") as HTMLButtonElement
		saveButton.addEventListener("click", SaveController.instance.save.bind(SaveController.instance), {
			passive: true,
		})

		const loadButton: HTMLButtonElement = document.getElementById("loadButton") as HTMLButtonElement
		loadButton.addEventListener("click", SaveController.instance.load.bind(SaveController.instance), {
			passive: true,
		})

		canvasPromise.then(() => {
			EraseController.instance
			SelectionController.instance
			PropertyController.instance
			ComponentPlacer.instance
		})
		this.initPromise = Promise.all([canvasPromise, symbolsDBPromise, mathJaxPromise, fontPromise]).then(() => {
			document.getElementById("loadingSpinner")?.classList.add("d-none")
			this.initAddComponentOffcanvas()
			this.initShortcuts()

			// Prevent "normal" browser menu
			document
				.getElementById("canvas")
				.addEventListener("contextmenu", (evt) => evt.preventDefault(), { passive: false })

			this.addSaveStateManagement()

			// prepare symbolDB for colorTheme
			for (const g of this.symbolsSVG.defs().node.querySelectorAll("symbol>g")) {
				this.preprocessSymbolColors(g)
			}

			const htmlElement = document.documentElement
			const switchElement = document.getElementById("darkModeSwitch") as HTMLInputElement
			switchElement.addEventListener("change", function () {
				if ((MainController.instance.darkMode = switchElement.checked)) {
					htmlElement.setAttribute("data-bs-theme", "dark")
					localStorage.setItem("circuitikz-designer-theme", "dark")
				} else {
					htmlElement.setAttribute("data-bs-theme", "light")
					localStorage.setItem("circuitikz-designer-theme", "light")
				}
				MainController.instance.updateTheme()
			})
			MainController.instance.updateTheme()
			PropertyController.instance.update()
			this.isInitDone = true
		})
	}

	private allTooltips: Tooltip[] = []
	public updateTooltips() {
		var isMobile = window.matchMedia("only screen and (max-width: 760px)").matches
		//enable tooltips globally
		const tooltipTriggerList = document.querySelectorAll(
			'[data-bs-toggle="tooltip"],[data-bs-toggle-second="tooltip"]'
		)
		for (const tooltip of this.allTooltips) {
			tooltip.dispose()
		}
		if (isMobile) {
			this.allTooltips = [...tooltipTriggerList].map(
				(tooltipTriggerEl) =>
					new Tooltip(tooltipTriggerEl, {
						fallbackPlacements: [], //always show them exactly where defined
						trigger: "manual",
					})
			)
		} else {
			this.allTooltips = [...tooltipTriggerList].map(
				(tooltipTriggerEl) =>
					new Tooltip(tooltipTriggerEl, {
						fallbackPlacements: [], //always show them exactly where defined
						delay: { show: 1000, hide: 0 },
					})
			)
		}
	}

	private async loadMathJax() {
		var promise = new Promise((resolve) => {
			if (!("MathJax" in window)) {
				;(window as any).MathJax = {
					tex: {
						inlineMath: { "[+]": [["$", "$"]] },
					},
				}
			}
			var script = document.createElement("script")
			script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"
			document.head.appendChild(script)

			script.addEventListener(
				"load",
				function () {
					resolve("")
				},
				false
			)
		})
		return promise
	}

	/**
	 * handle tabs and save state management
	 */
	private addSaveStateManagement() {
		// remove old localStorage data
		localStorage.removeItem("currentProgress")
		localStorage.removeItem("circuit2tikz-designer-grid")
		localStorage.removeItem("circuitikz-designer-grid")
		localStorage.removeItem("circuitikz-designer-saveState")
		sessionStorage.removeItem("circuitikz-designer-tabID")

		const defaultSettings: CanvasSettings = {}

		let db: IDBDatabase
		const IDBrequest = indexedDB.open("circuitikz-designer-db", 1)
		IDBrequest.onerror = function (event) {
			console.error("IndexedDB error")
			console.error(event)
		}
		IDBrequest.onupgradeneeded = function (event) {
			db = (event.target as IDBOpenDBRequest).result
			if (!db.objectStoreNames.contains("tabs")) {
				const objectStore = db.createObjectStore("tabs", { keyPath: "id" })
				objectStore.createIndex("open", "open", { unique: false })
			}
		}
		IDBrequest.onsuccess = function (event) {
			db = (event.target as IDBOpenDBRequest).result

			window.addEventListener("visibilitychange", (ev) => {
				if (document.visibilityState == "hidden") {
					MainController.instance.saveCurrentState(db, false)
				}
			})

			window.addEventListener("beforeunload", (ev) => {
				MainController.instance.saveCurrentState(db)
			})

			let tabsObjectStore = db.transaction("tabs", "readwrite").objectStore("tabs")

			// the URL of the current page
			var url = new URL(window.location.href)
			// check if a tabID is requested in the URL, otherwise use the first closed tab
			var requestedID = parseInt(url.searchParams.get("tabID"))

			tabsObjectStore.getAll().onsuccess = function (event) {
				let allTabs: TabState[] = (event.target as IDBRequest).result

				if (Number.isNaN(requestedID)) {
					// no tabID is requested in the URL, so we need to find the first closed tab
					requestedID = allTabs.findIndex((tab) => tab.open == "false")

					if (requestedID < 0) {
						// no closed tab found, use the next available ID
						requestedID = 0
						while (allTabs.find((tab) => tab.id == requestedID)) {
							requestedID++
						}
					}
				}

				let requestedTab = allTabs.find((tab) => tab.id == requestedID)
				if (requestedTab) {
					// if the requested tab is closed, open it
					requestedTab.open = "true"
					MainController.instance.tabID = requestedTab.id
					CanvasController.instance.setSettings(requestedTab.settings)
					SaveController.instance.loadFromJSON(requestedTab.data)
					tabsObjectStore.put(requestedTab).onsuccess = (event) => {
						MainController.instance.broadcastChannel.postMessage("update")
					}
				} else {
					// requested tab not found, so we create a new one
					const newEntry: TabState = {
						id: requestedID,
						open: "true",
						data: emtpySaveState,
						settings: defaultSettings,
					}
					MainController.instance.tabID = requestedID
					tabsObjectStore.add(newEntry).onsuccess = (event) => {
						// as soon as the tab is created and saved in the db, we can notify the other tabs
						MainController.instance.broadcastChannel.postMessage("update")
					}
				}
			}
		}

		//settings modal
		const settingsModalEl = document.getElementById("settingsModal") as HTMLDivElement
		const settingsTableBody = document.getElementById("settingsTableBody") as HTMLTableSectionElement

		settingsModalEl.addEventListener("show.bs.modal", (event) => {
			let tabsObjectStoreRead = db.transaction("tabs").objectStore("tabs")

			tabsObjectStoreRead.getAll().onsuccess = function (event) {
				settingsTableBody.innerHTML = ""

				const currentData = (event.target as IDBRequest).result as TabState[]

				let totalSize = 0

				for (let i = 0; i < currentData.length; i++) {
					const tabData = currentData[i]
					let row = settingsTableBody.appendChild(document.createElement("tr"))
					row.classList.add("text-end")
					let cell1 = row.appendChild(document.createElement("td"))
					cell1.innerText = "" + i
					let cell2 = row.appendChild(document.createElement("td"))
					cell2.innerText = countComponents(tabData.data.components) + ""
					let cell3 = row.appendChild(document.createElement("td"))
					let size = memorySizeOf(tabData.data)
					totalSize += size
					cell3.innerText = sizeString(size)
					let cell4 = row.appendChild(document.createElement("td"))
					if (tabData.open == "false") {
						let openButton = cell4.appendChild(document.createElement("button"))
						openButton.classList.add("btn", "btn-primary", "me-2")
						openButton.innerText = "Open"
						openButton.addEventListener("click", () => {
							// set the data in the object store to open
							window.open(".?tabID=" + tabData.id, "_blank")
						})

						let deleteButton = cell4.appendChild(document.createElement("button"))
						deleteButton.classList.add("btn", "btn-danger", "material-symbols-outlined")
						deleteButton.innerText = "delete"
						deleteButton.addEventListener("click", () => {
							let tabsObjectStore = db.transaction("tabs", "readwrite").objectStore("tabs")
							tabsObjectStore.delete(tabData.id).onsuccess = function () {
								settingsModalEl.dispatchEvent(new Event("show.bs.modal"))
								MainController.instance.broadcastChannel.postMessage("update")
							}
						})
					} else {
						if (tabData.id == MainController.instance.tabID) {
							let infoButton = cell4.appendChild(document.createElement("button"))
							infoButton.classList.add("btn")
							infoButton.innerText = "This tab"
							infoButton.disabled = true
							let _ = [cell1, cell2, cell3, cell4].forEach((cell) => {
								cell.classList.add("bg-primary")
							})
						} else {
							let closeButton = cell4.appendChild(document.createElement("button"))
							closeButton.classList.add("btn", "btn-danger")
							closeButton.innerText = "Close tab"
							closeButton.addEventListener("click", () => {
								// also set the open state to false in the db
								let tabsObjectStore = db.transaction("tabs", "readwrite").objectStore("tabs")
								const adjustedData = tabData
								adjustedData.open = "false"
								tabsObjectStore.put(adjustedData)
								// send a message to the broadcast channel to close the tab
								MainController.instance.broadcastChannel.postMessage("close=" + tabData.id)
							})
						}
					}
				}
				let row = settingsTableBody.appendChild(document.createElement("tr"))
				let cell1 = row.appendChild(document.createElement("td"))
				cell1.colSpan = 4
				cell1.classList.add("text-center")
				let newTabButton = cell1.appendChild(document.createElement("button"))
				newTabButton.classList.add("btn", "btn-primary")
				newTabButton.innerText = "New tab"
				newTabButton.addEventListener("click", () => {
					// set the data in the object store to open
					let requestedID = 0
					while (currentData.find((tab) => tab.id == requestedID)) {
						requestedID++
					}
					window.open(".?tabID=" + requestedID, "_blank")
				})

				document.getElementById("storageUsed").innerHTML = sizeString(totalSize)
			}
		})

		this.broadcastChannel.onmessage = (event) => {
			const msg = String(event.data)

			if (msg.startsWith("close")) {
				const tabID = parseInt(msg.split("=")[1]) // get the tabID
				if (tabID == MainController.instance.tabID) {
					// close the tab
					window.close()
				}
			} else if (msg == "update") {
				if (settingsModalEl.classList.contains("show")) {
					settingsModalEl.dispatchEvent(new Event("show.bs.modal"))
				}
			} else if (msg.startsWith("clipboard=")) {
				CopyPaste.setClipboard(JSON.parse(msg.slice(10)))
			}
		}

		function sizeString(size: number) {
			if (size < 1024) {
				return size + " B"
			} else if (size < 1024 * 1024) {
				return (size / 1024).toFixed(2) + " KB"
			} else if (size < 1024 * 1024 * 1024) {
				return (size / (1024 * 1024)).toFixed(2) + " MB"
			} else {
				return (size / (1024 * 1024 * 1024)).toFixed(2) + " GB"
			}
		}

		function countComponents(data: ComponentSaveObject[]) {
			let count = 0
			for (const component of data) {
				if (component.type == "group") {
					count += countComponents((component as GroupSaveObject).components)
				}
				count++
			}
			return count
		}
	}

	private saveCurrentState(db: IDBDatabase, closeTab = true) {
		Undo.addState()
		let tabsObjectStore = db.transaction("tabs", "readwrite").objectStore("tabs")
		tabsObjectStore.get(this.tabID).onsuccess = function (event) {
			const data = (event.target as IDBRequest).result as TabState
			if (closeTab) {
				data.open = "false"
			}
			data.data.components = Undo.getCurrentState()
			data.data.version = currentSaveVersion
			if (data.data.components.length > 0) {
				data.settings.gridVisible = CanvasController.instance.gridVisible
				data.settings.majorGridSizecm = CanvasController.instance.majorGridSizecm
				data.settings.majorGridSubdivisions = CanvasController.instance.majorGridSubdivisions
				data.settings.viewBox = CanvasController.instance.canvas.viewbox()
				data.settings.viewZoom = CanvasController.instance.currentZoom
				tabsObjectStore.put(data).onsuccess = function () {
					MainController.instance.broadcastChannel.postMessage("update")
				}
			} else {
				if (closeTab) {
					// if no data is present, delete the entry (keeps the db clean)
					tabsObjectStore.delete(MainController.instance.tabID).onsuccess = function () {
						MainController.instance.broadcastChannel.postMessage("update")
					}
				}
			}
		}
	}

	/**
	 * initialises keyboard shortcuts
	 */
	private initShortcuts() {
		// stop reload behaviour
		hotkeys("ctrl+r,command+r", () => false)

		// rotate selection
		hotkeys("ctrl+r,command+r", () => {
			if (this.mode == Modes.COMPONENT) {
				ComponentPlacer.instance.placeRotate(-90)
			} else {
				if (SelectionController.instance.hasSelection()) {
					SelectionController.instance.rotateSelection(-90)
					Undo.addState()
				}
			}
			return false
		})
		hotkeys("ctrl+shift+r,command+shift+r", () => {
			if (this.mode == Modes.COMPONENT) {
				ComponentPlacer.instance.placeRotate(90)
			} else {
				if (SelectionController.instance.hasSelection()) {
					SelectionController.instance.rotateSelection(90)
					Undo.addState()
				}
			}
			return false
		})

		//flip selection
		hotkeys("shift+x", () => {
			if (this.mode == Modes.COMPONENT) {
				ComponentPlacer.instance.placeFlip(true)
			} else {
				if (SelectionController.instance.hasSelection()) {
					SelectionController.instance.flipSelection(true)
					Undo.addState()
				}
			}
			return false
		})
		hotkeys("shift+y", () => {
			if (this.mode == Modes.COMPONENT) {
				ComponentPlacer.instance.placeFlip(false)
			} else {
				if (SelectionController.instance.hasSelection()) {
					SelectionController.instance.flipSelection(false)
					Undo.addState()
				}
			}
			return false
		})

		// select everything
		hotkeys("ctrl+a,command+a", () => {
			SelectionController.instance.selectAll()
			return false
		})

		//undo/redo
		hotkeys("ctrl+z,command+z", () => {
			Undo.undo()
			return false
		})
		hotkeys("ctrl+y,command+y", () => {
			Undo.redo()
			return false
		})
		document.getElementById("undoButton").addEventListener("click", () => Undo.undo())
		document.getElementById("redoButton").addEventListener("click", () => Undo.redo())

		//copy/paste
		hotkeys("ctrl+c,command+c", () => {
			CopyPaste.copy()
			return false
		})
		hotkeys("ctrl+v,command+v", () => {
			CopyPaste.paste()
			return false
		})
		hotkeys("ctrl+x,command+x", () => {
			CopyPaste.cut()
			return false
		})

		//save/load
		hotkeys("ctrl+s,command+s", () => {
			SaveController.instance.save()
			return false
		})
		hotkeys("ctrl+o,command+o", () => {
			SaveController.instance.load()
			return false
		})
		hotkeys("ctrl+e,command+e", () => {
			ExportController.instance.exportCircuiTikZ()
			return false
		})
		hotkeys("ctrl+shift+e,command+shift+e", () => {
			ExportController.instance.exportSVG()
			return false
		})

		// mode change
		hotkeys("q", () => {
			document.getElementById("addComponentButton").dispatchEvent(new MouseEvent("click"))
			return false
		})
		hotkeys("esc", () => {
			this.switchMode(Modes.DRAG_PAN)
			return false
		})
		hotkeys("w", () => {
			this.switchMode(Modes.DRAG_PAN)
			ComponentPlacer.instance.placeComponent(new WireComponent())
			return false
		})
		hotkeys("del, backspace", () => {
			if (!SelectionController.instance.hasSelection()) {
				this.switchMode(Modes.ERASE)
			} else {
				SelectionController.instance.removeSelection()
				Undo.addState()
			}
			return false
		})
		hotkeys("t", () => {
			this.switchMode(Modes.DRAG_PAN)
			ComponentPlacer.instance.placeComponent(new RectangleComponent(true))
			return false
		})

		// handle shortcuts for adding components
		// shortcutDict maps the Shortcut key to the title attribute of the html element where the callback can be found
		var shortcutDict: { shortcut: string; component: string }[] = [
			{ shortcut: "g", component: "Ground" },
			{ shortcut: "alt+g,option+g", component: "Ground (tailless)" },
			{ shortcut: "r", component: "Resistor (american)" },
			{ shortcut: "c", component: "Capacitor" },
			{ shortcut: "alt+c,option+c", component: "Curved (polarized) capacitor" },
			{ shortcut: "l", component: "Inductor (american)" },
			{ shortcut: "alt+l,option+l", component: "Inductor (cute)" },
			{ shortcut: "d", component: "Empty diode" },
			{ shortcut: "b", component: "NPN" },
			{ shortcut: "alt+b,option+b", component: "PNP" },
			{ shortcut: "n", component: "NMOS" },
			{ shortcut: "alt+n,option+n", component: "PMOS" },
			{ shortcut: "x", component: "Plain style crossing node" },
			{ shortcut: "alt+x,option+x", component: "Jumper-style crossing node" },
			{ shortcut: ".", component: "Connected terminal" },
			{ shortcut: "alt+.,option+.", component: "Unconnected terminal" },
		]
		// when a valid shortcut button is pressed, simulate a click on the corresponding button for the component
		for (const { shortcut, component } of shortcutDict) {
			hotkeys(shortcut, () => {
				this.switchMode(Modes.DRAG_PAN) //switch to standard mode to avoid weird states
				var componentButton = document.querySelector('[title="' + component + '"]')
				var clickEvent = new MouseEvent("mouseup", { view: window, bubbles: true, cancelable: true })
				componentButton?.dispatchEvent(clickEvent)
			})
		}
	}

	/**
	 * Init the canvas controller
	 */
	private async initCanvas() {
		let canvasElement: SVGSVGElement = await waitForElementLoaded("canvas")
		if (canvasElement) this.canvasController = new CanvasController(new SVG.Svg(canvasElement))
	}

	/**
	 * Fetch & parse the symbol(s) svg.
	 */
	private async initSymbolDB() {
		// Fetch symbol DB
		const symbolDBlink: HTMLLinkElement = await waitForElementLoaded("symbolDBlink")
		const response = await fetch(symbolDBlink.href, {
			method: "GET",
			// must match symbolDBlink cors options in order to actually use the preloaded file
			mode: "cors",
			credentials: "same-origin",
		})
		const textContent = await response.text()

		// Parse & add to DOM
		const symbolsDocument: XMLDocument = new DOMParser().parseFromString(textContent, "image/svg+xml")
		const symbolsSVGSVGElement: SVGSVGElement = document.adoptNode(
			symbolsDocument.firstElementChild as SVGSVGElement
		)
		symbolsSVGSVGElement.style.display = "none"
		symbolsSVGSVGElement.setAttribute("id", "symbolDB")
		document.body.appendChild(symbolsSVGSVGElement)

		// Extract symbols
		this.symbolsSVG = new SVG.Svg(symbolsSVGSVGElement)
		const componentsMetadata = Array.from(this.symbolsSVG.node.getElementsByTagName("component"))

		this.symbols = componentsMetadata.flatMap((componentMetadata) => {
			return new ComponentSymbol(componentMetadata)
		})
	}

	/**
	 * Init the mode change buttons.
	 */
	private initModeButtons() {
		this.modeSwitchButtons.modeDragPan = document.getElementById("modeDragPan")
		this.modeSwitchButtons.modeDrawLine = document.getElementById("modeDrawLine")
		this.modeSwitchButtons.modeEraser = document.getElementById("modeEraser")

		this.modeSwitchButtons.modeDragPan.addEventListener("click", () => this.switchMode(Modes.DRAG_PAN), {
			passive: false,
		})
		this.modeSwitchButtons.modeDrawLine.addEventListener(
			"click",
			() => {
				this.switchMode(Modes.DRAG_PAN)
				this.modeSwitchButtons.modeDrawLine.classList.add("selected")
				ComponentPlacer.instance.placeComponent(new WireComponent())
			},
			{ passive: false }
		)
		this.modeSwitchButtons.modeEraser.addEventListener("click", () => this.switchMode(Modes.ERASE), {
			passive: false,
		})
	}

	private addShapeComponentsToOffcanvas(leftOffcanvasAccordion: HTMLDivElement, leftOffcanvasOC: Offcanvas) {
		// Add shapes accordion area
		let groupName = "Basic"
		const collapseGroupID = "collapseGroup-" + groupName.replace(/[^\d\w\-\_]+/gi, "-")

		const accordionGroup = leftOffcanvasAccordion.appendChild(document.createElement("div"))
		accordionGroup.classList.add("accordion-item")

		const accordionItemHeader = accordionGroup.appendChild(document.createElement("h2"))
		accordionItemHeader.classList.add("accordion-header")

		const accordionItemButton = accordionItemHeader.appendChild(document.createElement("button"))
		accordionItemButton.classList.add("accordion-button")
		accordionItemButton.innerText = groupName
		accordionItemButton.setAttribute("aria-controls", collapseGroupID)
		accordionItemButton.setAttribute("aria-expanded", "true")
		accordionItemButton.setAttribute("data-bs-target", "#" + collapseGroupID)
		accordionItemButton.setAttribute("data-bs-toggle", "collapse")
		accordionItemButton.type = "button"

		const accordionItemCollapse = accordionGroup.appendChild(document.createElement("div"))
		accordionItemCollapse.classList.add("accordion-collapse", "collapse", "show")
		accordionItemCollapse.id = collapseGroupID
		accordionItemCollapse.setAttribute("data-bs-parent", "#leftOffcanvasAccordion")

		const accordionItemBody = accordionItemCollapse.appendChild(document.createElement("div"))
		accordionItemBody.classList.add("accordion-body", "iconLibAccordionBody")

		//Add Text
		{
			const addButton: HTMLDivElement = accordionItemBody.appendChild(document.createElement("div"))
			addButton.classList.add("libComponent")
			addButton.setAttribute("searchData", "text node")
			addButton.ariaRoleDescription = "button"
			addButton.title = "Text"

			const listener = (ev: MouseEvent) => {
				ev.preventDefault()

				this.switchMode(Modes.DRAG_PAN)
				let newComponent = new RectangleComponent(true)
				ComponentPlacer.instance.placeComponent(newComponent)

				leftOffcanvasOC.hide()
			}

			addButton.addEventListener("mouseup", listener)
			addButton.addEventListener("touchstart", listener, { passive: false })

			let svgIcon = SVG.SVG().addTo(addButton)
			svgIcon.viewbox(-1, -14, 30, 15)
			svgIcon.text((add) => {
				add.tspan("Text").fill({ color: defaultStroke })
			})
		}

		//Add rectangle
		{
			const addButton: HTMLDivElement = accordionItemBody.appendChild(document.createElement("div"))
			addButton.classList.add("libComponent")
			addButton.setAttribute("searchData", "rect rectangle node")
			addButton.ariaRoleDescription = "button"
			addButton.title = "Rectangle/Text"

			const listener = (ev: MouseEvent) => {
				ev.preventDefault()

				this.switchMode(Modes.DRAG_PAN)
				let newComponent = new RectangleComponent(false)
				ComponentPlacer.instance.placeComponent(newComponent)

				leftOffcanvasOC.hide()
			}

			addButton.addEventListener("mouseup", listener)
			addButton.addEventListener("touchstart", listener, { passive: false })

			let svgIcon = SVG.SVG().addTo(addButton)
			svgIcon.viewbox(0, 0, 17, 12)
			svgIcon.rect(15, 10).move(1, 1).fill("none").stroke({
				color: defaultStroke,
				width: 1,
			})
		}
		//Add Ellipse
		{
			const addButton: HTMLDivElement = accordionItemBody.appendChild(document.createElement("div"))
			addButton.classList.add("libComponent")
			addButton.setAttribute("searchData", "ellipse circle node")
			addButton.ariaRoleDescription = "button"
			addButton.title = "Ellipse"

			const listener = (ev: MouseEvent) => {
				ev.preventDefault()
				this.switchMode(Modes.COMPONENT)

				if (ComponentPlacer.instance.component) {
					ComponentPlacer.instance.placeCancel()
				}

				let newComponent = new EllipseComponent()
				ComponentPlacer.instance.placeComponent(newComponent)

				leftOffcanvasOC.hide()
			}

			addButton.addEventListener("mouseup", listener)
			addButton.addEventListener("touchstart", listener, { passive: false })

			let svgIcon = SVG.SVG().addTo(addButton)
			svgIcon.viewbox(0, 0, 17, 12)
			svgIcon.ellipse(15, 10).move(1, 1).fill("none").stroke({
				color: defaultStroke,
				width: 1,
			})
		}

		//Add Polygon
		{
			const addButton: HTMLDivElement = accordionItemBody.appendChild(document.createElement("div"))
			addButton.classList.add("libComponent")
			addButton.setAttribute("searchData", "polygon path")
			addButton.ariaRoleDescription = "button"
			addButton.title = "Polygon"

			const listener = (ev: MouseEvent) => {
				ev.preventDefault()
				this.switchMode(Modes.COMPONENT)

				if (ComponentPlacer.instance.component) {
					ComponentPlacer.instance.placeCancel()
				}

				let newComponent = new PolygonComponent()
				ComponentPlacer.instance.placeComponent(newComponent)

				leftOffcanvasOC.hide()
			}

			addButton.addEventListener("mouseup", listener)
			addButton.addEventListener("touchstart", listener, { passive: false })

			let svgIcon = SVG.SVG().addTo(addButton)
			svgIcon.viewbox(0, 0, 17, 12)
			svgIcon
				.polygon([
					[1, 1],
					[16, 1],
					[15, 11],
					[11, 9],
					[5, 11],
				])
				.fill("none")
				.stroke({
					color: defaultStroke,
					width: 1,
				})
		}

		//Add straight line
		{
			const addButton: HTMLDivElement = accordionItemBody.appendChild(document.createElement("div"))
			addButton.classList.add("libComponent")
			addButton.setAttribute("searchData", "straight line path")
			addButton.ariaRoleDescription = "button"
			addButton.title = "Straight line"

			const listener = (ev: MouseEvent) => {
				ev.preventDefault()

				this.switchMode(Modes.DRAG_PAN)
				let newComponent = new WireComponent(true)
				ComponentPlacer.instance.placeComponent(newComponent)

				leftOffcanvasOC.hide()
			}

			addButton.addEventListener("mouseup", listener)
			addButton.addEventListener("touchstart", listener, { passive: false })

			let svgIcon = SVG.SVG().addTo(addButton)
			svgIcon.viewbox(0, 0, 17, 12)
			svgIcon.line(2, 10, 15, 2).stroke({ color: defaultStroke, width: 1, opacity: 1 })
		}

		//Add straight arrow
		{
			const addButton: HTMLDivElement = accordionItemBody.appendChild(document.createElement("div"))
			addButton.classList.add("libComponent")
			addButton.setAttribute("searchData", "straight arrow path")
			addButton.ariaRoleDescription = "button"
			addButton.title = "Straight arrow"

			const listener = (ev: MouseEvent) => {
				ev.preventDefault()

				this.switchMode(Modes.DRAG_PAN)
				let newComponent = new WireComponent(true, true)
				ComponentPlacer.instance.placeComponent(newComponent)

				leftOffcanvasOC.hide()
			}

			addButton.addEventListener("mouseup", listener)
			addButton.addEventListener("touchstart", listener, { passive: false })

			let svgIcon = SVG.SVG().addTo(addButton)
			svgIcon.viewbox(-1, -1, 12, 6)
			svgIcon
				.polygon([
					[6, 0],
					[10, 2],
					[6, 4],
					[6, 2.2],
					[0, 2.2],
					[0, 1.8],
					[6, 1.8],
				])
				.rotate(-30, 5, 2)
				.fill({ color: defaultStroke })
		}

		//Add arrow
		{
			const addButton: HTMLDivElement = accordionItemBody.appendChild(document.createElement("div"))
			addButton.classList.add("libComponent")
			addButton.setAttribute("searchData", "arrow path")
			addButton.ariaRoleDescription = "button"
			addButton.title = "Arrow"

			const listener = (ev: MouseEvent) => {
				ev.preventDefault()

				this.switchMode(Modes.DRAG_PAN)
				let newComponent = new WireComponent(false, true)
				ComponentPlacer.instance.placeComponent(newComponent)

				leftOffcanvasOC.hide()
			}

			addButton.addEventListener("mouseup", listener)
			addButton.addEventListener("touchstart", listener, { passive: false })

			let svgIcon = SVG.SVG().addTo(addButton)
			svgIcon.viewbox(-1, -2, 12, 8)
			svgIcon
				.polyline([
					[0, 5],
					[5, 5],
					[5, 0],
					[9.1, 0],
				])
				.stroke({ color: defaultStroke, width: 0.5 })
				.fill("none")
			svgIcon
				.polygon([
					[9, -1],
					[10.5, 0],
					[9, 1],
				])
				.fill({ color: defaultStroke })
		}
	}

	/**
	 * Init the left add offcanvas.
	 */
	private async initAddComponentOffcanvas() {
		const leftOffcanvas: HTMLDivElement = document.getElementById("leftOffcanvas") as HTMLDivElement
		const leftOffcanvasOC = new Offcanvas(leftOffcanvas)
		document.getElementById("componentFilterInput").addEventListener("input", this.filterComponents)
		document.getElementById("filterRegexButton").addEventListener("click", this.filterComponents)

		const addComponentButton: HTMLAnchorElement = document.getElementById("addComponentButton") as HTMLAnchorElement
		addComponentButton.addEventListener(
			"click",
			((ev: PointerEvent) => {
				this.switchMode(Modes.DRAG_PAN)
				leftOffcanvasOC.toggle()
				if (leftOffcanvas.classList.contains("showing") && ev.pointerType !== "touch") {
					let searchBar = document.getElementById("componentFilterInput")
					const refocus = () => {
						searchBar.focus()
						leftOffcanvas.removeEventListener("shown.bs.offcanvas", refocus)
					}
					refocus()
					leftOffcanvas.addEventListener("shown.bs.offcanvas", refocus)
				}
			}).bind(this),
			{ passive: true }
		)
		const leftOffcanvasAccordion: HTMLDivElement = document.getElementById(
			"leftOffcanvasAccordion"
		) as HTMLDivElement

		const groupedSymbols: Map<string, ComponentSymbol[]> = this.symbols.reduce(
			(
				groupedSymbols: Map<string, ComponentSymbol[]>,
				symbol: ComponentSymbol
			): Map<string, ComponentSymbol[]> => {
				const key = symbol.groupName || "Unsorted components"
				let group = groupedSymbols.get(key)
				if (group) group.push(symbol)
				else groupedSymbols.set(key, [symbol])
				return groupedSymbols
			},
			new Map()
		)

		this.addShapeComponentsToOffcanvas(leftOffcanvasAccordion, leftOffcanvasOC)

		for (const [groupName, symbols] of groupedSymbols.entries()) {
			const collapseGroupID = "collapseGroup-" + groupName.replace(/[^\d\w\-\_]+/gi, "-")

			const accordionGroup = leftOffcanvasAccordion.appendChild(document.createElement("div"))
			accordionGroup.classList.add("accordion-item")

			const accordionItemHeader = accordionGroup.appendChild(document.createElement("h2"))
			accordionItemHeader.classList.add("accordion-header")

			const accordionItemButton = accordionItemHeader.appendChild(document.createElement("button"))
			accordionItemButton.classList.add("accordion-button", "collapsed")
			accordionItemButton.innerText = groupName
			accordionItemButton.setAttribute("aria-controls", collapseGroupID)
			accordionItemButton.setAttribute("aria-expanded", "false")
			accordionItemButton.setAttribute("data-bs-target", "#" + collapseGroupID)
			accordionItemButton.setAttribute("data-bs-toggle", "collapse")
			accordionItemButton.type = "button"

			const accordionItemCollapse = accordionGroup.appendChild(document.createElement("div"))
			accordionItemCollapse.classList.add("accordion-collapse", "collapse")
			accordionItemCollapse.id = collapseGroupID
			accordionItemCollapse.setAttribute("data-bs-parent", "#leftOffcanvasAccordion")

			const accordionItemBody = accordionItemCollapse.appendChild(document.createElement("div"))
			accordionItemBody.classList.add("accordion-body", "iconLibAccordionBody")

			for (const symbol of symbols) {
				const addButton: HTMLDivElement = accordionItemBody.appendChild(document.createElement("div"))
				addButton.classList.add("libComponent")
				addButton.setAttribute(
					"searchData",
					[symbol.tikzName, symbol.isNodeSymbol ? "node" : "path"]
						.concat(
							symbol.possibleOptions
								.map((option) => option.displayName ?? option.name)
								.concat(
									symbol.possibleEnumOptions.flatMap((enumOption) =>
										enumOption.options.map((option) => option.displayName ?? option.name)
									)
								)
						)
						.join(" ")
				)
				addButton.ariaRoleDescription = "button"
				addButton.title = symbol.displayName || symbol.tikzName

				const listener = (ev: MouseEvent) => {
					ev.preventDefault()
					this.switchMode(Modes.COMPONENT)

					if (ComponentPlacer.instance.component) {
						ComponentPlacer.instance.placeCancel()
					}

					let newComponent: CircuitComponent
					if (symbol.isNodeSymbol) {
						newComponent = new NodeSymbolComponent(symbol)
					} else {
						newComponent = new PathSymbolComponent(symbol)
					}
					ComponentPlacer.instance.placeComponent(newComponent)

					leftOffcanvasOC.hide()
				}

				addButton.addEventListener("mouseup", listener)
				addButton.addEventListener("touchstart", listener, { passive: false })

				let svgIcon = SVG.SVG().addTo(addButton)

				let viewBox = new SVG.Box(symbol._mapping.values().toArray()[0].viewBox)

				//oversize viewbox due to stroke widths
				viewBox.width += symbol.maxStroke
				viewBox.height += symbol.maxStroke
				viewBox.x -= symbol.maxStroke / 2
				viewBox.y -= symbol.maxStroke / 2

				// svg icon should have new size
				svgIcon.viewbox(viewBox).width(viewBox.width).height(viewBox.height)

				let use = svgIcon.use(symbol.symbolElement.id())
				use.width(symbol.viewBox.width).height(symbol.viewBox.height) // use should have original size values
				use.stroke(defaultStroke).fill(defaultFill).node.style.color = defaultStroke
			}
		}
	}

	/**
	 * filter the components in the left OffCanvas to only show what matches the search string (in a new accordeon item)
	 */
	private filterComponents(evt: Event) {
		evt.preventDefault()
		evt.stopPropagation()

		const element = document.getElementById("componentFilterInput") as HTMLInputElement
		const feedbacktext = document.getElementById("invalid-feedback-text")
		const filterWithRegex = document.getElementById("filterRegexButton").classList.contains("active")

		let text = element.value
		let regex = null
		if (filterWithRegex) {
			regex = new RegExp(text, "i")
			element.classList.remove("is-invalid")
			feedbacktext.classList.add("d-none")
		} else {
			try {
				regex = new RegExp(".*" + text.split("").join(".*") + ".*", "i")
				element.classList.remove("is-invalid")
				feedbacktext.classList.add("d-none")
			} catch (e) {
				text = ""
				regex = new RegExp(text, "i")
				element.classList.add("is-invalid")
				feedbacktext.classList.remove("d-none")
			}
		}

		const accordion = document.getElementById("leftOffcanvasAccordion")

		const accordionItems = accordion.getElementsByClassName("accordion-item")
		Array.prototype.forEach.call(accordionItems, (accordionItem: HTMLDivElement, index: number) => {
			const libComponents = accordionItem.getElementsByClassName("libComponent")
			let showCount = 0
			Array.prototype.forEach.call(libComponents, (libComponent: HTMLDivElement) => {
				if (text) {
					if (!(regex.test(libComponent.title) || regex.test(libComponent.getAttribute("searchData")))) {
						libComponent.classList.add("d-none")
						return
					}
				}
				libComponent.classList.remove("d-none")
				showCount++
			})
			if (showCount === 0) {
				accordionItem.classList.add("d-none")
			} else {
				accordionItem.classList.remove("d-none")
			}

			if (text) {
				accordionItem.children[0]?.children[0]?.classList.remove("collapsed")
				accordionItem.children[1]?.classList.add("show")
			} else {
				accordionItem.children[0]?.children[0]?.classList.add("collapsed")
				accordionItem.children[1]?.classList.remove("show")
			}

			if (index === 0) {
				accordionItem.children[0]?.children[0]?.classList.remove("collapsed")
				accordionItem.children[1]?.classList.add("show")
			}
		})
	}

	/**
	 * Switches the mode. This deactivates the old controller and activates the new one.
	 */
	public switchMode(newMode: Modes) {
		if (newMode == this.mode) return
		let oldMode = this.mode
		this.mode = newMode

		switch (oldMode) {
			case Modes.DRAG_PAN:
				this.modeSwitchButtons.modeDragPan.classList.remove("selected")
				CanvasController.instance.deactivatePanning()
				SelectionController.instance.deactivateSelection()
				break
			case Modes.ERASE:
				this.modeSwitchButtons.modeEraser.classList.remove("selected")
				EraseController.instance.deactivate()
				break
			case Modes.COMPONENT:
				this.modeSwitchButtons.modeDragPan.classList.remove("selected")
				this.modeSwitchButtons.modeDrawLine.classList.remove("selected")
				ComponentPlacer.instance.placeCancel()
				CanvasController.instance.deactivatePanning()
				break
			default:
				break
		}

		switch (newMode) {
			case Modes.DRAG_PAN:
				this.modeSwitchButtons.modeDragPan.classList.add("selected")
				CanvasController.instance.activatePanning()
				SelectionController.instance.activateSelection()
				break
			case Modes.ERASE:
				this.modeSwitchButtons.modeEraser.classList.add("selected")
				EraseController.instance.activate()
				break
			case Modes.COMPONENT:
				this.modeSwitchButtons.modeDragPan.classList.add("selected")
				CanvasController.instance.activatePanning()
				break
			default:
				break
		}
	}

	public updateTheme() {
		if (this.darkModeLast == this.darkMode) {
			return
		}

		for (const instance of this.circuitComponents) {
			instance.updateTheme()
		}

		this.darkModeLast = this.darkMode
	}

	/**
	 * add missing fill attributes to all symbol db entries where fill is undefined --> needs explicit setting, otherwise the color theme change does strange things.
	 * called once on initialization
	 * @param {Element} node
	 */
	private preprocessSymbolColors(node: Element) {
		let elementsWithFill = node.querySelectorAll("[fill]")
		let elementsWithStroke = node.querySelectorAll("[stroke]")

		//this group
		let currentFill = node.getAttribute("fill")
		if (currentFill == "#fff") {
			node.setAttribute("fill", "currentFill")
		}
		let currentStroke = node.getAttribute("stroke")
		if (currentStroke == "#000") {
			node.setAttribute("stroke", "currentStroke")
		}

		for (const element of elementsWithFill) {
			let currentFill = element.getAttribute("fill")

			if (currentFill == "#fff") {
				element.setAttribute("fill", "currentFill")
			}
		}

		for (const element of elementsWithStroke) {
			let currentStroke = element.getAttribute("stroke")

			if (currentStroke == "#000") {
				element.setAttribute("stroke", "currentStroke")
			}
		}

		this.addFill(node)
	}

	private addFill(node: Element) {
		let hasFill = node.getAttribute("fill") !== null
		if (hasFill) {
			return
		}
		for (const element of node.children) {
			if (element.nodeName === "g") {
				this.addFill(element)
			} else {
				if (!element.getAttribute("fill")) {
					element.setAttribute("fill", "currentColor")
				}
			}
		}
	}

	/**
	 * Adds a new instance to {@link circuitComponents} and adds its snapping points.
	 */
	public addComponent(circuitComponent: CircuitComponent) {
		this.circuitComponents.push(circuitComponent)
	}

	/**
	 * Removes an instance from {@link instances} and also removes its snapping points.
	 */
	public removeComponent(circuitComponent: CircuitComponent) {
		const idx = this.circuitComponents.indexOf(circuitComponent)
		if (idx > -1) {
			this.circuitComponents.splice(idx, 1)
			circuitComponent.remove()
		}
	}
}
