/**
 * @module mainController
 */

import * as SVG from "@svgdotjs/svg.js";
import { Button as _bootstrapButton, Collapse as _bootstrapCollapse, Offcanvas, Tooltip } from "bootstrap";
import "../utils/impSVGNumber";
import { waitForElementLoaded } from "../utils/domWatcher";
import hotkeys from 'hotkeys-js';
import {version} from '../../../package.json';

import { CanvasController, EraseController, SnapController, SnapCursorController, ExportController, SelectionController, SaveController, Undo, CopyPaste, PropertyController, ComponentInstance} from "../internal";
import { ComponentSymbol, NodeComponentSymbol, PathComponentSymbol, NodeComponentInstance, PathComponentInstance, LineDrawer, Line } from "../internal";

/** @typedef {import("../internal").ComponentInstance} ComponentInstance */

type SaveState = {
	currentIndices: any[];
	currentData: any[];
}

export class MainController {
	/** @type {?MainController} */
	static #instance: MainController | null = null;
	// controllers
	/** @type {?CanvasController} */
	canvasController: CanvasController | null = null;
	/** @type {?LineDrawer} */
	lineDrawer: LineDrawer | null = null;
	/** @type {?EraseController} */
	eraseController: EraseController | null = null;
	/** @type {?ExportController} */
	exportController: ExportController | null = null;
	/** @type {?SaveController} */
	saveController: SaveController | null = null;

	/** @type {SVG.Svg} */
	symbolsSVG: SVG.Svg;
	/** @type {ComponentSymbol[]} */
	symbols: ComponentSymbol[];

	darkMode = true;
	#darkModeLast = true;
	#currentTheme = "dark";

	#tabID=-1

	/**
	 * COMMENT/TODO: properly utilize the "component placing" mode:
	 * clicking component shortcuts or an icon in the "+" menu should activate this component placing mode
	 * component placing mode returns to DRAG_PAN as soon as the component has been successfully placed
	 * Therefore: all kinds of behaviour can be checked and activated/deactivated more easily with this mode
	 * 
	 * This mode will not be shown to the user (show drag_pan instead)
	 */
	
	/**
	 * @readonly
	 * @enum {number}
	 */
	static modes = {
		DRAG_PAN: 1,
		DRAW_LINE: 2,
		ERASE: 3,
		COMPONENT: 4,
	};

	mode = MainController.modes.DRAG_PAN;

	#modeSwitchButtons = {
		/** @type {?HTMLAnchorElement} */
		modeDragPan: null,
		/** @type {?HTMLAnchorElement} */
		modeDrawLine: null,
		/** @type {?HTMLAnchorElement} */
		modeEraser: null,
	};

	/** @type {Promise} */
	initPromise: Promise<any>;
	/** @type {boolean} */
	isInitDone: boolean = false;

	/** @type {ComponentInstance[]} */
	instances: ComponentInstance[] = [];
	/** @type {Line[]} */
	lines: Line[] = [];

	static appVersion = "0.0.0";

	isMac = false
	snapController: SnapController;
	selectionController: SelectionController;

	/**
	 * Init the app.
	 */
	constructor() {
		this.isMac = window.navigator.userAgent.toUpperCase().indexOf('MAC')>=0

		this.#addSaveStateManagement()

		// dark mode init
		const htmlElement = document.documentElement;		
		const switchElement = document.getElementById('darkModeSwitch') as HTMLInputElement;
		const defaultTheme = window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
		this.#currentTheme = localStorage.getItem('circuitikz-designer-theme') || defaultTheme;
		htmlElement.setAttribute('data-bs-theme', this.#currentTheme);
		this.#darkModeLast=false;
		this.darkMode = this.#currentTheme === 'dark';
		switchElement.checked = this.darkMode;

		this.snapController = SnapController.controller;
		let mathJaxPromise = this.#loadMathJax();
		let canvasPromise = this.#initCanvas();
		let symbolsDBPromise = this.#initSymbolDB();

		MainController.appVersion = version;
		document.addEventListener('DOMContentLoaded', () => {
			for (const element of document.getElementsByClassName('version')) {
				element.textContent = "v" + version;
			}
		});

		this.#initModeButtons();

		//enable tooltips globally
		const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"],[data-bs-toggle-second="tooltip"]')
		const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new Tooltip(tooltipTriggerEl,{
			fallbackPlacements:[] //always show them exactly where defined
		}))

		this.exportController = new ExportController(this);
		/** @type {HTMLButtonElement} */
		const exportCircuiTikZButton: HTMLButtonElement = document.getElementById("exportCircuiTikZButton") as HTMLButtonElement;
		exportCircuiTikZButton.addEventListener(
			"click",
			this.exportController.exportCircuiTikZ.bind(this.exportController),
			{
				passive: true,
			}
		);

		/** @type {HTMLButtonElement} */
		const exportSVGButton: HTMLButtonElement = document.getElementById("exportSVGButton") as HTMLButtonElement;
		exportSVGButton.addEventListener(
			"click",
			this.exportController.exportSVG.bind(this.exportController),
			{
				passive: true,
			}
		);
		
		this.saveController = new SaveController();
		/** @type {HTMLButtonElement} */
		const saveButton: HTMLButtonElement = document.getElementById("saveButton") as HTMLButtonElement;
		saveButton.addEventListener(
			"click",
			this.saveController.save.bind(this.saveController),
			{
				passive: true,
			}
		);

		/** @type {HTMLButtonElement} */
		const loadButton: HTMLButtonElement = document.getElementById("loadButton") as HTMLButtonElement;
		loadButton.addEventListener(
			"click",
			this.saveController.load.bind(this.saveController),
			{
				passive: true,
			}
		);

		canvasPromise.then(() => {
			this.lineDrawer = new LineDrawer(this);
			this.eraseController = new EraseController(this);
			this.selectionController = new SelectionController(this);
			new PropertyController();
		});
		this.initPromise = Promise.all([canvasPromise, symbolsDBPromise, mathJaxPromise]).then(() => {
			new SnapCursorController(this.canvasController.canvas);
			this.#initAddComponentOffcanvas();
			this.#initShortcuts();

			// Prevent "normal" browser menu
			document.getElementById("canvas").addEventListener("contextmenu", (evt) => evt.preventDefault(), { passive: false });

			let currentProgress: SaveState = JSON.parse(localStorage.getItem('circuitikz-designer-saveState'))
		
			if (Object.keys(currentProgress.currentData[this.#tabID]).length>0) {
				this.saveController.loadFromJSON(currentProgress.currentData[this.#tabID])
			}else{
				Undo.addState()
			}

			// prepare symbolDB for colorTheme
			for (const g of this.symbolsSVG.defs().node.querySelectorAll("symbol>g")) {
				this.#addFill(g)
			}

			const htmlElement = document.documentElement;
			const switchElement = document.getElementById('darkModeSwitch') as HTMLInputElement;
			switchElement.addEventListener('change', function () {
				if (MainController.controller.darkMode = switchElement.checked) {
					htmlElement.setAttribute('data-bs-theme', 'dark');
					localStorage.setItem('circuitikz-designer-theme', 'dark');
				} else {
					htmlElement.setAttribute('data-bs-theme', 'light');
					localStorage.setItem('circuitikz-designer-theme', 'light');
				}
				MainController.controller.updateTheme()
			});
			MainController.controller.updateTheme()
			PropertyController.controller.update()
			this.isInitDone = true;
		});
	}

	async #loadMathJax(){
		var promise = new Promise((resolve)=>{
			if (!("MathJax" in window)) {
				(window as any).MathJax = {
					tex: {
						inlineMath: {'[+]': [['$', '$']]}
					}
				};
			}
			var script = document.createElement('script');
			script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
			document.head.appendChild(script);
	
			script.addEventListener('load', function() {
				resolve("");
			}, false);
		})
		return promise
	}

	/**
	 * make it possible to open multiple tabs and all with different save States.
	 */
	#addSaveStateManagement(){
		const objname = "circuitikz-designer-saveState"

		let defaultProgress: SaveState = {
			currentIndices:[],
			currentData:[]
		}

		// TODO check if multithreading of tabs can mess with localStorage due to a race condition???
		
		// load localStorage or default if it doesn't exist
		let storageString = localStorage.getItem(objname)
		let current: SaveState = storageString?JSON.parse(storageString):defaultProgress

		// load the tab ID if reopening the page was a reload/restore (sessionStorage persists in that case)
		let sessionTabID = sessionStorage.getItem("circuitikz-designer-tabID")
		if (sessionTabID) {
			this.#tabID = Number.parseInt(sessionTabID)
			current.currentIndices.push(this.#tabID)
		}
		
		// this is a new tab --> assign tab ID
		if (this.#tabID<0) {
			// populate first available slot
			let index = 0
			while (current.currentIndices.includes(index)) {
				index++;
			}
			this.#tabID = index
			current.currentIndices.push(this.#tabID)
		}

		// save the assigned tab ID
		sessionStorage.setItem("circuitikz-designer-tabID",this.#tabID.toString())

		// adjust the saveData object to accomodate new data if necessary
		if (current.currentData.length<=this.#tabID) {
			current.currentData.push({})
		}
		
		// save the current state of tabs
		localStorage.setItem(objname,JSON.stringify(current))

		// prepare saveState for unloading
		window.addEventListener("beforeunload",(ev)=>{
			Undo.addState()
			let currentProgress: SaveState = JSON.parse(localStorage.getItem(objname))
			
			currentProgress.currentIndices.splice(currentProgress.currentIndices.findIndex((value)=>value==MainController.controller.#tabID),1)
			currentProgress.currentData[this.#tabID] = Undo.getCurrentState()
			localStorage.setItem(objname,JSON.stringify(currentProgress))
			
			// localStorage.clear() //use this here if the localStorage is fucked in development
			//TODO add manual way to clear the localStorage
		})
	}

	/**
	 * initialises keyboard shortcuts
	 */
	#initShortcuts(){		
		// stop reload behaviour
		hotkeys('ctrl+r,command+r', ()=>false);

		// rotate selection
		hotkeys("ctrl+r,command+r",()=>{
			this.selectionController.rotateSelection(-90);
			if (this.selectionController.hasSelection()) {
				Undo.addState()
			}
			return false;
		})
		hotkeys("ctrl+shift+r,command+shift+r",()=>{
			this.selectionController.rotateSelection(90);
			if (this.selectionController.hasSelection()) {
				Undo.addState()
			}
			return false;
		})

		//flip selection
		hotkeys("shift+x",()=>{
			this.selectionController.flipSelection(true);
			if (this.selectionController.hasSelection()) {
				Undo.addState()
			}
			return false;
		})
		hotkeys("shift+y",()=>{
			this.selectionController.flipSelection(false);
			if (this.selectionController.hasSelection()) {
				Undo.addState()
			}
			return false;
		})

		// select everything
		hotkeys("ctrl+a,command+a",()=>{
			this.selectionController.selectAll();
			return false;
		})

		//undo/redo
		hotkeys("ctrl+z,command+z",()=>{
			Undo.undo();
			return false;
		})
		hotkeys("ctrl+y,command+y",()=>{
			Undo.redo();
			return false;
		})
		document.getElementById("undoButton").addEventListener("click",()=>Undo.undo())
		document.getElementById("redoButton").addEventListener("click",()=>Undo.redo())

		//copy/paste
		hotkeys("ctrl+c,command+c",()=>{
			CopyPaste.copy()
			return false;
		})
		hotkeys("ctrl+v,command+v",()=>{
			CopyPaste.paste()
			return false;
		})
		hotkeys("ctrl+x,command+x",()=>{
			CopyPaste.cut()
			return false;
		})

		//save/load
		hotkeys("ctrl+s,command+s",()=>{
			this.saveController.save()
			return false;
		})
		hotkeys("ctrl+o,command+o",()=>{
			this.saveController.load()
			return false;
		})
		hotkeys("ctrl+e,command+e",()=>{
			this.exportController.exportCircuiTikZ()
			return false;
		})
		hotkeys("ctrl+shift+e,command+shift+e",()=>{
			this.exportController.exportSVG()
			return false;
		})

		// mode change
		hotkeys("q",()=>{
			document.getElementById("addComponentButton").dispatchEvent(new MouseEvent("click"))
			return false;
		})
		hotkeys("esc",()=>{
			this.#switchMode(MainController.modes.DRAG_PAN);
			return false;
		})
		hotkeys("w",()=>{
			this.#switchMode(MainController.modes.DRAW_LINE);
			return false;
		})
		hotkeys("del, backspace",()=>{
			if(!SelectionController.controller.hasSelection()){
				this.#switchMode(MainController.modes.ERASE);
			}else{
				SelectionController.controller.removeSelection()
				Undo.addState()
			}
			return false;
		})

		// handle shortcuts for adding components
		// shortcutDict maps the Shortcut key to the title attribute of the html element where the callback can be found
		var shortcutDict = {
			"g":"Ground",
			"alt+g,option+g":"Ground (tailless)",
			"r":"Resistor (american)",
			"c":"Capacitor",
			"alt+c,option+c":"Curved (polarized) capacitor",
			"l":"Inductor (american)",
			"alt+l,option+l":"Inductor (cute)",
			"d":"Empty diode",
			"b":"NPN",
			"alt+b,option+b":"PNP",
			"n":"NMOS",
			"alt+n,option+n":"PMOS",
			"x":"Plain style crossing node",
			"alt+x,option+x":"Jumper-style crossing node",
			".":"Connected terminal",
			"alt+.,option+.":"Unconnected terminal",
		}
		// when a valid shortcut button is pressed, simulate a click on the corresponding button for the component
		for (const [key, value] of Object.entries(shortcutDict)) {
			hotkeys(key,()=>{
				this.#switchMode(MainController.modes.DRAG_PAN); //switch to standard mode to avoid weird states
				var componentButton = document.querySelector('[title="'+value+'"]')
				var clickEvent = new MouseEvent('mouseup',{view:window,bubbles:true,cancelable:true,});
				componentButton?.dispatchEvent(clickEvent);
			})
		}
	}

	/**
	 * Getter for the singleton instance.
	 * @returns {MainController}
	 */
	static get controller(): MainController {
		return MainController.#instance || (MainController.#instance = new MainController());
	}

	/**
	 * Init the canvas controller
	 */
	async #initCanvas() {
		let canvasElement = await waitForElementLoaded("canvas");
		if (canvasElement) this.canvasController = new CanvasController(new SVG.Svg(canvasElement));
	}

	/**
	 * Fetch & parse the symbol(s) svg.
	 */
	async #initSymbolDB() {
		// Fetch symbol DB
		/** @type {HTMLLinkElement} */
		const symbolDBlink: HTMLLinkElement = await waitForElementLoaded("symbolDBlink");
		const response = await fetch(symbolDBlink.href, {
			method: "GET",
			// must match symbolDBlink cors options in order to actually use the preloaded file
			mode: "cors",
			credentials: "same-origin",
		});
		const textContent = await response.text();

		// Parse & add to DOM
		/** @type {XMLDocument} */
		const symbolsDocument: XMLDocument = new DOMParser().parseFromString(textContent, "image/svg+xml");
		/** @type {SVGSVGElement} */
		const symbolsSVGSVGElement: SVGSVGElement = document.adoptNode(symbolsDocument.firstElementChild as SVGSVGElement);
		symbolsSVGSVGElement.style.display = "none";
		symbolsSVGSVGElement.setAttribute("id","symbolDB")
		document.body.appendChild(symbolsSVGSVGElement);

		// Extract symbols
		this.symbolsSVG = new SVG.Svg(symbolsSVGSVGElement);
		/** @type {SVG.Defs} */
		const defs: SVG.Defs = this.symbolsSVG.defs();
		/** @type {SVGSymbolElement[]} */
		const symbols: SVGSymbolElement[] = Array.prototype.filter.call(defs.node.children, (def) => def instanceof SVGSymbolElement);
		// let symbols = defs.children().filter((/** @type {SVG.Element} */def) => def instanceof SVG.Symbol);
		this.symbols = symbols.flatMap((symbol) => {
			const baseInfo = ComponentSymbol.getBaseInformation(symbol);
			if (baseInfo.isNode === baseInfo.isPath) return []; // type not correctly set
			try {
				if (baseInfo.isNode) return new NodeComponentSymbol(symbol, baseInfo);
				else return new PathComponentSymbol(symbol, baseInfo);
			} catch (e) {
				console.log(e);
				return [];
			}
		});
	}

	/**
	 * Init the mode change buttons.
	 */
	#initModeButtons() {
		this.#modeSwitchButtons.modeDragPan = document.getElementById("modeDragPan");
		this.#modeSwitchButtons.modeDrawLine = document.getElementById("modeDrawLine");
		this.#modeSwitchButtons.modeEraser = document.getElementById("modeEraser");

		this.#modeSwitchButtons.modeDragPan.addEventListener(
			"click",
			() => this.#switchMode(MainController.modes.DRAG_PAN),
			{ passive: false }
		);
		this.#modeSwitchButtons.modeDrawLine.addEventListener(
			"click",
			() => this.#switchMode(MainController.modes.DRAW_LINE),
			{ passive: false }
		);
		this.#modeSwitchButtons.modeEraser.addEventListener(
			"click",
			() => this.#switchMode(MainController.modes.ERASE),
			{ passive: false }
		);
	}

	/**
	 * Init the left add offcanvas.
	 */
	async #initAddComponentOffcanvas() {
		const leftOffcanvas: HTMLDivElement = document.getElementById("leftOffcanvas") as HTMLDivElement;
		const leftOffcanvasOC = new Offcanvas(leftOffcanvas);
		document.getElementById("componentFilterInput").addEventListener("input",this.filterComponents);

		const addComponentButton: HTMLAnchorElement = document.getElementById("addComponentButton") as HTMLAnchorElement;
		addComponentButton.addEventListener(
			"click",
			(() => {
				this.#switchMode(MainController.modes.DRAG_PAN);
				leftOffcanvasOC.toggle();				
				if (leftOffcanvas.classList.contains("showing")) {
					let searchBar = document.getElementById("componentFilterInput")
					const refocus = ()=>{
						searchBar.focus()
						leftOffcanvas.removeEventListener('shown.bs.offcanvas',refocus)
					}
					refocus()
					leftOffcanvas.addEventListener('shown.bs.offcanvas',refocus)
				}
			}).bind(this),
			{ passive: true }
		);
		const leftOffcanvasAccordion: HTMLDivElement = document.getElementById("leftOffcanvasAccordion") as HTMLDivElement;

		const groupedSymbols: Map<string, ComponentSymbol[]> = this.symbols.reduce(
			(groupedSymbols: Map<string, ComponentSymbol[]>, symbol: ComponentSymbol): Map<string, ComponentSymbol[]> => {
				const key = symbol.groupName || "Unsorted components";
				let group = groupedSymbols.get(key);
				if (group) group.push(symbol);
				else groupedSymbols.set(key, [symbol]);
				return groupedSymbols;
			},
			new Map()
		);

		let iconsWithoutViewBox: SVGSVGElement[] = [];
		let firstGroup = true;
		for (const [groupName, symbols] of groupedSymbols.entries()) {
			const collapseGroupID = "collapseGroup-" + groupName.replace(/[^\d\w\-\_]+/gi, "-");

			const accordionGroup = leftOffcanvasAccordion.appendChild(document.createElement("div"));
			accordionGroup.classList.add("accordion-item");

			const accordionItemHeader = accordionGroup.appendChild(document.createElement("h2"));
			accordionItemHeader.classList.add("accordion-header");

			const accordionItemButton = accordionItemHeader.appendChild(document.createElement("button"));
			accordionItemButton.classList.add("accordion-button", firstGroup ? undefined : "collapsed");
			accordionItemButton.innerText = groupName;
			accordionItemButton.setAttribute("aria-controls", collapseGroupID);
			accordionItemButton.setAttribute("aria-expanded", firstGroup.toString());
			accordionItemButton.setAttribute("data-bs-target", "#" + collapseGroupID);
			accordionItemButton.setAttribute("data-bs-toggle", "collapse");
			accordionItemButton.type = "button";

			const accordionItemCollapse = accordionGroup.appendChild(document.createElement("div"));
			accordionItemCollapse.classList.add("accordion-collapse", "collapse", firstGroup ? "show" : undefined);
			accordionItemCollapse.id = collapseGroupID;
			accordionItemCollapse.setAttribute("data-bs-parent", "#leftOffcanvasAccordion");

			const accordionItemBody = accordionItemCollapse.appendChild(document.createElement("div"));
			accordionItemBody.classList.add("accordion-body", "iconLibAccordionBody");

			for (const symbol of symbols) {
				const addButton: HTMLDivElement = accordionItemBody.appendChild(document.createElement("div"));
				addButton.classList.add("libComponent");
				addButton.setAttribute("searchData",[symbol.tikzName].concat(Array.from(symbol._tikzOptions.keys())).join(" "))
				addButton.ariaRoleDescription = "button";
				addButton.title = symbol.displayName || symbol.tikzName;

				const listener = (ev: MouseEvent) => {
					ev.preventDefault();
					this.#switchMode(MainController.modes.COMPONENT)
					const oldComponent = this.canvasController.placingComponent;
					let lastpoint = null;
					if (oldComponent) {
						// if currently placing a component, use the new component instead and remove the old component
						if (oldComponent instanceof PathComponentInstance) {
							if (oldComponent.getPointsSet()>0) {
								lastpoint = oldComponent.getStartPoint();
							}else{
								oldComponent.firstClick(CanvasController.controller.lastCanvasPoint);
							}
							oldComponent.secondClick(CanvasController.controller.lastCanvasPoint, false);//cleanly finish placing the oldComponent somewhere before deleting it
						}
						this.removeInstance(oldComponent);
					}

					const newInstance = symbol.addInstanceToContainer(this.canvasController.canvas, ev, ()=>{
						this.#switchMode(MainController.modes.DRAG_PAN);
						if (newInstance) {
							// only refire event if the component was sucessfully created
							var clickEvent = new MouseEvent('mouseup',{view:window,bubbles:true,cancelable:true,});
							addButton?.dispatchEvent(clickEvent);
						}
					});
					if (newInstance instanceof PathComponentInstance) {
						if (lastpoint) {
							newInstance.firstClick(lastpoint);
							newInstance.moveTo(CanvasController.controller.lastCanvasPoint);
						}
					}else if(newInstance instanceof NodeComponentInstance){
						let point = CanvasController.controller.lastCanvasPoint
						newInstance.moveTo(point)
					}
					this.canvasController.placingComponent = newInstance;
					this.addInstance(newInstance);
					
					leftOffcanvasOC.hide();
				};

				addButton.addEventListener("mouseup", listener);
				addButton.addEventListener("touchstart", listener, { passive: false });

				const svgIcon: SVGSVGElement = addButton.appendChild(document.createElementNS(SVG.namespaces.svg, "svg"));
				if (symbol.viewBox) {
					svgIcon.setAttributeNS(
						null,
						"viewBox",
						symbol.viewBox.x +
							" " +
							symbol.viewBox.y +
							" " +
							symbol.viewBox.width +
							" " +
							symbol.viewBox.height
					);
					svgIcon.setAttributeNS(null, "width", symbol.viewBox.width);
					svgIcon.setAttributeNS(null, "height", symbol.viewBox.height);
				}

				const svgUse = svgIcon.appendChild(document.createElementNS(SVG.namespaces.svg, "use"));
				svgUse.setAttributeNS(SVG.namespaces.xlink, "href", "#" + symbol.id());

				if (!symbol.viewBox) iconsWithoutViewBox.push(svgIcon);
			}

			firstGroup = false;
		}

		/**
		 *
		 * @param {DOMRect|null|undefined} box
		 * @returns {boolean}
		 */
		function isNullishBox(box: DOMRect | null | undefined): boolean {
			return !box || (!box.x && !box.y && !box.width && !box.height);
		}

		while (iconsWithoutViewBox.length > 0 && isNullishBox(iconsWithoutViewBox[0].getBBox()))
			await new Promise((resolve) => requestAnimationFrame(resolve));

		iconsWithoutViewBox.forEach(async (svgIcon) => {
			/** @type {DOMRect} */
			let box: DOMRect;
			// wait for browser rendering and setting the bounding box
			while (isNullishBox((box = svgIcon.getBBox({ clipped: false, fill: true, markers: true, stroke: true }))))
				await new Promise((resolve) => requestAnimationFrame(resolve));

			svgIcon.setAttributeNS(null, "viewBox", box.x + " " + box.y + " " + box.width + " " + box.height);
			svgIcon.setAttributeNS(null, "width", box.width.toString());
			svgIcon.setAttributeNS(null, "height", box.height.toString());
		});
	}

	/**
	 * filter the components in the left OffCanvas to only show what matches the search string (in a new accordeon item)
	 * @param {Event} evt 
	 */
	filterComponents(evt: Event){
		evt.preventDefault();
		evt.stopPropagation();
		
		const element = document.getElementById('componentFilterInput') as HTMLInputElement;
		const feedbacktext = document.getElementById('invalid-feedback-text');
		let text = element.value;
		let regex = null;
		try {
			regex = new RegExp(text, "i");
			element.classList.remove("is-invalid");
			feedbacktext.classList.add("d-none");
		} catch (e) {
			text = "";
			regex = new RegExp(text, "i");
			element.classList.add("is-invalid");
			feedbacktext.classList.remove("d-none");
		}

		const accordion = document.getElementById("leftOffcanvasAccordion");

		const accordionItems = accordion.getElementsByClassName("accordion-item");
		Array.prototype.forEach.call(accordionItems,(accordionItem: HTMLDivElement,index:number)=>{
			const libComponents = accordionItem.getElementsByClassName("libComponent");
			let showCount = 0;
			Array.prototype.forEach.call(libComponents,(libComponent: HTMLDivElement)=>{
				if (text) {
					if (!(regex.test(libComponent.title)||regex.test(libComponent.getAttribute("searchData")))) {
						libComponent.classList.add("d-none");
						return;
					}
				}
				libComponent.classList.remove("d-none");
				showCount++;
			});
			if (showCount===0) {
				accordionItem.classList.add("d-none");
			}else{
				accordionItem.classList.remove("d-none");
			}

			if (text) {
				accordionItem.children[0]?.children[0]?.classList.remove("collapsed");
				accordionItem.children[1]?.classList.add("show");
			}else{
				accordionItem.children[0]?.children[0]?.classList.add("collapsed");
				accordionItem.children[1]?.classList.remove("show");
			}

			if (index===0) {
				accordionItem.children[0]?.children[0]?.classList.remove("collapsed");
				accordionItem.children[1]?.classList.add("show");
			}
		});
	}

	/**
	 * Switches the mode. This deactivates the old controller and activates the new one.
	 *
	 * @param {number} newMode - the new mode; one of {@link MainController.modes}
	 */
	#switchMode(newMode: number) {
		if (newMode === this.mode) return;

		switch (this.mode) {
			case MainController.modes.DRAG_PAN:
				this.#modeSwitchButtons.modeDragPan.classList.remove("selected");
				this.canvasController.deactivatePanning();
				this.selectionController.deactivateSelection();
				for (const instance of this.instances) {
					if (instance.disableDrag) instance.disableDrag();
				}
				break;
			case MainController.modes.DRAW_LINE:
				this.#modeSwitchButtons.modeDrawLine.classList.remove("selected");
				this.lineDrawer.deactivate();
				break;
			case MainController.modes.ERASE:
				this.#modeSwitchButtons.modeEraser.classList.remove("selected");
				this.eraseController.deactivate();
				break;
			case MainController.modes.COMPONENT:
				this.#modeSwitchButtons.modeDragPan.classList.remove("selected");
				this.canvasController.deactivatePanning();
				break;
			default:
				break;
		}

		switch (newMode) {
			case MainController.modes.DRAG_PAN:
				this.#modeSwitchButtons.modeDragPan.classList.add("selected");
				this.canvasController.activatePanning();
				this.selectionController.activateSelection();
				for (const instance of this.instances) {
					if (instance.enableDrag) instance.enableDrag();
				}
				break;
			case MainController.modes.DRAW_LINE:
				this.#modeSwitchButtons.modeDrawLine.classList.add("selected");
				this.lineDrawer.activate();
				break;
			case MainController.modes.ERASE:
				this.#modeSwitchButtons.modeEraser.classList.add("selected");
				this.eraseController.activate();
				break;
			case MainController.modes.COMPONENT:
				this.#modeSwitchButtons.modeDragPan.classList.add("selected");
				this.canvasController.activatePanning();
				break;
			default:
				break;
		}

		this.mode = newMode;
	}

	updateTheme(){
		if (this.#darkModeLast==this.darkMode) {
			return;
		}
		const light = "#fff"
		const dark = "#000"
		const node = this.symbolsSVG.defs().node;

		// toggle stroke and fill for each element if the attribute exists on this element
		for (const g of node.querySelectorAll("g,path,use")) {
			let currentStroke = g.getAttribute("stroke")
			if (currentStroke&&!(currentStroke==="none"||currentStroke==="transparent")) {
				if (currentStroke===light) {
					g.setAttribute("stroke",dark)
				}else if(currentStroke===dark){
					g.setAttribute("stroke",light)
				}
			}
			let currentFill = g.getAttribute("fill")
			if (currentFill&&!(currentFill==="none"||currentFill==="transparent")) {
				if (currentFill===light) {
					g.setAttribute("fill",dark)
				}else if(currentFill===dark){
					g.setAttribute("fill",light)
				}
			}
		}

		for (const line of this.lines) {
			line.updateTheme()
		}

		for (const instance of this.instances) {
			if (instance instanceof PathComponentInstance) {
				instance.updateTheme()
			}
		}
		SelectionController.controller.updateTheme()

		this.#darkModeLast = this.darkMode
	}

	/**
	 * add missing fill attributes to all symbol db entries where fill is undefined --> needs explicit setting, otherwise the color theme change does strange things.
	 * called once on initialization
	 * @param {Element} node 
	 */
	#addFill(node: Element){
		let hasFill = node.getAttribute("fill") !==null;
		if (hasFill) {
			return;
		}
		for (const element of node.children) {
			if (element.nodeName === "g") {
				this.#addFill(element)
			}else{
				if (!element.getAttribute("fill")) {
					element.setAttribute("fill","#000")
				}
			}
		}
	}

	/**
	 * Adds a new instance to {@link instances} and adds its snapping points.
	 *
	 * @param {ComponentInstance} newInstance - the instance to add
	 */
	addInstance(newInstance: ComponentInstance) {
		this.instances.push(newInstance);
		const snappingPoints = newInstance.snappingPoints || [];
		if (snappingPoints.length > 0) this.snapController.addSnapPoints(snappingPoints);
	}

	/**
	 * Adds a new line to {@link lines}.
	 *
	 * @param {Line} newLine - the line to add
	 */
	addLine(newLine: Line) {
		this.lines.push(newLine);
	}

	/**
	 * Removes a instance from {@link instances} and also removes its snapping points.
	 *
	 * @param {ComponentInstance} instance - the instance to remove
	 */
	removeInstance(instance: ComponentInstance) {
		instance.remove();
		const idx = this.instances.indexOf(instance);
		if (idx >= 0) {
			this.instances.splice(idx, 1);
			const snappingPoints = instance.snappingPoints || [];
			if (snappingPoints.length > 0) this.snapController.removeSnapPoints(snappingPoints);
		}
	}

	/**
	 * Removes a line from {@link lines}.
	 * @param {Line} line - the line to remove
	 */
	removeLine(line: Line) {
		line.remove();
		const idx = this.lines.indexOf(line);
		if (idx >= 0) this.lines.splice(idx, 1);
	}
}
