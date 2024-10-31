import * as SVG from "@svgdotjs/svg.js";
import { Button as _bootstrapButton, Collapse as _bootstrapCollapse, Offcanvas, Tooltip } from "bootstrap";
import "../utils/impSVGNumber";
import { waitForElementLoaded } from "../utils/domWatcher";
import hotkeys from 'hotkeys-js';
import {version} from '../../../package.json';

import { CanvasController, SnapCursorController, ExportController, SelectionController, SaveController, Undo, CopyPaste, PropertyController, CircuitComponent, ComponentPlacer, NodeComponent, CircuitikzComponent, PathComponent, WireComponent, ComponentSymbol, ComponentSaveObject, EraseController, RectangleComponent} from "../internal";

type SaveState = {
	currentIndices: number[];
	currentData: ComponentSaveObject[][];
}

export enum Modes {
	DRAG_PAN,
	COMPONENT,
	ERASE
}

// TODO Test
// TODO redo comments

export class MainController {
	private static _instance: MainController;
	public static get instance(): MainController {
		if (!MainController._instance) {
			MainController._instance = new MainController()
		}
		return MainController._instance;
	}

	
	// controllers
	canvasController:CanvasController

	symbolsSVG: SVG.Svg;
	symbols: ComponentSymbol[];

	public darkMode = true;
	private darkModeLast = true;
	private currentTheme = "dark";

	private tabID=-1

	mode = Modes.DRAG_PAN;

	private modeSwitchButtons = {
		modeDragPan: null,
		modeDrawLine: null,
		modeEraser: null,
	};

	initPromise: Promise<any>;
	isInitDone: boolean = false;

	circuitComponents: CircuitComponent[] = [];
	// instances: ComponentInstance[] = [];
	// lines: Line[] = [];

	static appVersion = "0.0.0";

	isMac = false
	selectionController: SelectionController;

	/**
	 * Init the app.
	 */
	private constructor() {
		MainController._instance = this
		this.isMac = window.navigator.userAgent.toUpperCase().indexOf('MAC')>=0

		this.addSaveStateManagement()

		// dark mode init
		const htmlElement = document.documentElement;		
		const switchElement = document.getElementById('darkModeSwitch') as HTMLInputElement;
		const defaultTheme = window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
		this.currentTheme = localStorage.getItem('circuitikz-designer-theme') || defaultTheme;
		htmlElement.setAttribute('data-bs-theme', this.currentTheme);
		this.darkModeLast=false;
		this.darkMode = this.currentTheme === 'dark';
		switchElement.checked = this.darkMode;

		let mathJaxPromise = this.loadMathJax();
		let canvasPromise = this.initCanvas();
		let symbolsDBPromise = this.initSymbolDB();

		MainController.appVersion = version;
		document.addEventListener('DOMContentLoaded', () => {
			for (const element of document.getElementsByClassName('version')) {
				element.textContent = "v" + version;
			}
		});

		this.initModeButtons();

		var isMobile = window.matchMedia("only screen and (max-width: 760px)").matches;

		//enable tooltips globally
		const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"],[data-bs-toggle-second="tooltip"]')
		if (isMobile) {
			const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new Tooltip(tooltipTriggerEl,{
				fallbackPlacements:[], //always show them exactly where defined
				trigger:'manual'
			}))
		}else{
			const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new Tooltip(tooltipTriggerEl,{
				fallbackPlacements:[], //always show them exactly where defined
			}))
		}

		// init exporting
		ExportController.instance;
		const exportCircuiTikZButton: HTMLButtonElement = document.getElementById("exportCircuiTikZButton") as HTMLButtonElement;
		exportCircuiTikZButton.addEventListener(
			"click",
			ExportController.instance.exportCircuiTikZ.bind(ExportController.instance),
			{
				passive: true,
			}
		);

		const exportSVGButton: HTMLButtonElement = document.getElementById("exportSVGButton") as HTMLButtonElement;
		exportSVGButton.addEventListener(
			"click",
			ExportController.instance.exportSVG.bind(ExportController.instance),
			{
				passive: true,
			}
		);
		
		// init save and load
		SaveController.instance;
		const saveButton: HTMLButtonElement = document.getElementById("saveButton") as HTMLButtonElement;
		saveButton.addEventListener(
			"click",
			SaveController.instance.save.bind(SaveController.instance),
			{
				passive: true,
			}
		);

		const loadButton: HTMLButtonElement = document.getElementById("loadButton") as HTMLButtonElement;
		loadButton.addEventListener(
			"click",
			SaveController.instance.load.bind(SaveController.instance),
			{
				passive: true,
			}
		);

		canvasPromise.then(() => {
			EraseController.instance;
			SelectionController.instance;
			PropertyController.instance;
			ComponentPlacer.instance;
		});
		this.initPromise = Promise.all([canvasPromise, symbolsDBPromise, mathJaxPromise]).then(() => {
			document.getElementById("loadingSpinner")?.classList.add("d-none")
			SnapCursorController.instance
			this.initAddComponentOffcanvas();
			this.initShortcuts();

			// Prevent "normal" browser menu
			document.getElementById("canvas").addEventListener("contextmenu", (evt) => evt.preventDefault(), { passive: false });

			let currentProgress: SaveState = JSON.parse(localStorage.getItem('circuitikz-designer-saveState'))
		
			if (Object.keys(currentProgress.currentData[this.tabID]).length>0) {
				SaveController.instance.loadFromJSON(currentProgress.currentData[this.tabID])
			}else{
				Undo.addState()
			}

			// prepare symbolDB for colorTheme
			for (const g of this.symbolsSVG.defs().node.querySelectorAll("symbol>g")) {
				this.addFill(g)
			}

			const htmlElement = document.documentElement;
			const switchElement = document.getElementById('darkModeSwitch') as HTMLInputElement;
			switchElement.addEventListener('change', function () {
				if (MainController.instance.darkMode = switchElement.checked) {
					htmlElement.setAttribute('data-bs-theme', 'dark');
					localStorage.setItem('circuitikz-designer-theme', 'dark');
				} else {
					htmlElement.setAttribute('data-bs-theme', 'light');
					localStorage.setItem('circuitikz-designer-theme', 'light');
				}
				MainController.instance.updateTheme()
			});
			MainController.instance.updateTheme()
			PropertyController.instance.update()
			this.isInitDone = true;
		});
	}

	private async loadMathJax(){
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
	private addSaveStateManagement(){
		const objname = "circuitikz-designer-saveState"
		const tabname = "circuitikz-designer-tabID"

		let defaultProgress: SaveState = {
			currentIndices:[],
			currentData:[]
		}

		// TODO check if multithreading of tabs can mess with localStorage due to a race condition???
		
		// load localStorage or default if it doesn't exist
		let storageString = localStorage.getItem(objname)
		let current: SaveState = storageString?JSON.parse(storageString):defaultProgress

		// load the tab ID if reopening the page was a reload/restore (sessionStorage persists in that case)
		let sessionTabID = sessionStorage.getItem(tabname)
		if (sessionTabID) {
			this.tabID = Number.parseInt(sessionTabID)
			current.currentIndices.push(this.tabID)
		}
		
		// this is a new tab --> assign tab ID
		if (this.tabID<0) {
			// populate first available slot
			let index = 0
			while (current.currentIndices.includes(index)) {
				index++;
			}
			this.tabID = index
			current.currentIndices.push(this.tabID)
		}

		// save the assigned tab ID
		sessionStorage.setItem(tabname,this.tabID.toString())

		// adjust the saveData object to accomodate new data if necessary
		if (current.currentData.length<=this.tabID) {
			current.currentData.push([])
		}
		
		// save the current state of tabs
		localStorage.setItem(objname,JSON.stringify(current))

		//TODO get rid of unload events: will be removed from chrome in the future and is currently ignored by many browsers
		// prepare saveState for unloading
		window.addEventListener("beforeunload",(ev)=>{
			Undo.addState()
			let currentProgress: SaveState = JSON.parse(localStorage.getItem(objname))
			
			currentProgress.currentIndices.splice(currentProgress.currentIndices.findIndex((value)=>value==MainController.instance.tabID),1)
			currentProgress.currentData[this.tabID] = Undo.getCurrentState()
			localStorage.setItem(objname,JSON.stringify(currentProgress))
			
			//use this here if the localStorage is fucked in development
			// localStorage.removeItem(objname)
			// localStorage.removeItem(tabname)

			//TODO add manual way to clear the localStorage
		})
	}

	/**
	 * initialises keyboard shortcuts
	 */
	private initShortcuts(){		
		// stop reload behaviour
		hotkeys('ctrl+r,command+r', ()=>false);

		// rotate selection
		hotkeys("ctrl+r,command+r",()=>{
			if (this.mode==Modes.COMPONENT) {
				ComponentPlacer.instance.placeRotate(-90)
			}else{
				if (SelectionController.instance.hasSelection()) {
					SelectionController.instance.rotateSelection(-90);
					Undo.addState()
				}
			}
			return false;
		})
		hotkeys("ctrl+shift+r,command+shift+r",()=>{
			if (this.mode==Modes.COMPONENT) {
				ComponentPlacer.instance.placeRotate(90)
			}else{
				SelectionController.instance.rotateSelection(90);
				if (SelectionController.instance.hasSelection()) {
					Undo.addState()
				}
			}
			return false;
		})

		//flip selection
		hotkeys("shift+x",()=>{
			if (this.mode==Modes.COMPONENT) {
				ComponentPlacer.instance.placeFlip(true)
			}else{
				if (SelectionController.instance.hasSelection()) {
					SelectionController.instance.flipSelection(true);
					Undo.addState()
				}
			}
			return false;
		})
		hotkeys("shift+y",()=>{
			if (this.mode==Modes.COMPONENT) {
				ComponentPlacer.instance.placeFlip(false)
			}else{
				if (SelectionController.instance.hasSelection()) {
					SelectionController.instance.flipSelection(false);
					Undo.addState()
				}
			}
			return false;
		})

		// select everything
		hotkeys("ctrl+a,command+a",()=>{
			SelectionController.instance.selectAll();
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
			SaveController.instance.save()
			return false;
		})
		hotkeys("ctrl+o,command+o",()=>{
			SaveController.instance.load()
			return false;
		})
		hotkeys("ctrl+e,command+e",()=>{
			ExportController.instance.exportCircuiTikZ()
			return false;
		})
		hotkeys("ctrl+shift+e,command+shift+e",()=>{
			ExportController.instance.exportSVG()
			return false;
		})

		// mode change
		hotkeys("q",()=>{
			document.getElementById("addComponentButton").dispatchEvent(new MouseEvent("click"))
			return false;
		})
		hotkeys("esc",()=>{
			this.switchMode(Modes.DRAG_PAN);
			return false;
		})
		hotkeys("w",()=>{
			ComponentPlacer.instance.placeCancel()
			ComponentPlacer.instance.placeComponent(new WireComponent())
			return false;
		})
		hotkeys("del, backspace",()=>{
			if(!SelectionController.instance.hasSelection()){
				this.switchMode(Modes.ERASE);
			}else{
				SelectionController.instance.removeSelection()
				Undo.addState()
			}
			return false;
		})

		
		hotkeys('k', ()=>{
			ComponentPlacer.instance.placeComponent(new RectangleComponent())
			return false
		});

		// handle shortcuts for adding components
		// shortcutDict maps the Shortcut key to the title attribute of the html element where the callback can be found
		var shortcutDict: {shortcut:string,component:string}[] = [
			{shortcut:"g",component:"Ground"},
			{shortcut:"alt+g,option+g",component:"Ground (tailless)"},
			{shortcut:"r",component:"Resistor (american)"},
			{shortcut:"c",component:"Capacitor"},
			{shortcut:"alt+c,option+c",component:"Curved (polarized) capacitor"},
			{shortcut:"l",component:"Inductor (american)"},
			{shortcut:"alt+l,option+l",component:"Inductor (cute)"},
			{shortcut:"d",component:"Empty diode"},
			{shortcut:"b",component:"NPN"},
			{shortcut:"alt+b,option+b",component:"PNP"},
			{shortcut:"n",component:"NMOS"},
			{shortcut:"alt+n,option+n",component:"PMOS"},
			{shortcut:"x",component:"Plain style crossing node"},
			{shortcut:"alt+x,option+x",component:"Jumper-style crossing node"},
			{shortcut:".",component:"Connected terminal"},
			{shortcut:"alt+.,option+.",component:"Unconnected terminal"},
		]
		// when a valid shortcut button is pressed, simulate a click on the corresponding button for the component
		for (const {shortcut,component} of shortcutDict) {
			hotkeys(shortcut,()=>{
				this.switchMode(Modes.DRAG_PAN); //switch to standard mode to avoid weird states
				var componentButton = document.querySelector('[title="'+component+'"]')
				var clickEvent = new MouseEvent('mouseup',{view:window,bubbles:true,cancelable:true,});
				componentButton?.dispatchEvent(clickEvent);
			})
		}
	}

	/**
	 * Init the canvas controller
	 */
	private async initCanvas() {
		let canvasElement: SVGSVGElement = await waitForElementLoaded("canvas");
		if (canvasElement) this.canvasController = new CanvasController(new SVG.Svg(canvasElement));
	}

	/**
	 * Fetch & parse the symbol(s) svg.
	 */
	private async initSymbolDB() {
		// Fetch symbol DB
		const symbolDBlink: HTMLLinkElement = await waitForElementLoaded("symbolDBlink");
		const response = await fetch(symbolDBlink.href, {
			method: "GET",
			// must match symbolDBlink cors options in order to actually use the preloaded file
			mode: "cors",
			credentials: "same-origin",
		});
		const textContent = await response.text();

		// Parse & add to DOM
		const symbolsDocument: XMLDocument = new DOMParser().parseFromString(textContent, "image/svg+xml");
		const symbolsSVGSVGElement: SVGSVGElement = document.adoptNode(symbolsDocument.firstElementChild as SVGSVGElement);
		symbolsSVGSVGElement.style.display = "none";
		symbolsSVGSVGElement.setAttribute("id","symbolDB")
		document.body.appendChild(symbolsSVGSVGElement);

		// Extract symbols
		this.symbolsSVG = new SVG.Svg(symbolsSVGSVGElement);
		const defs: SVG.Defs = this.symbolsSVG.defs();
		const symbols: SVGSymbolElement[] = Array.prototype.filter.call(defs.node.children, (def) => def instanceof SVGSymbolElement);
		// let symbols = defs.children().filter((/** @type {SVG.Element} */def) => def instanceof SVG.Symbol);
		this.symbols = symbols.flatMap((symbol) => {
			const baseInfo = ComponentSymbol.getBaseInformation(symbol);
			if (baseInfo.isNode === baseInfo.isPath) return []; // type not correctly set
			try {
				// if (baseInfo.isNode) return new NodeComponentSymbol(symbol, baseInfo);
				// else return new PathComponentSymbol(symbol, baseInfo);
				return new ComponentSymbol(symbol,baseInfo)
			} catch (e) {
				console.log(e);
				return [];
			}
		});
	}

	/**
	 * Init the mode change buttons.
	 */
	private initModeButtons() {
		this.modeSwitchButtons.modeDragPan = document.getElementById("modeDragPan");
		this.modeSwitchButtons.modeDrawLine = document.getElementById("modeDrawLine");
		this.modeSwitchButtons.modeEraser = document.getElementById("modeEraser");

		this.modeSwitchButtons.modeDragPan.addEventListener(
			"click",
			() => this.switchMode(Modes.DRAG_PAN),
			{ passive: false }
		);
		this.modeSwitchButtons.modeDrawLine.addEventListener(
			"click",
			() => {
				this.switchMode(Modes.COMPONENT)
				this.modeSwitchButtons.modeDrawLine.classList.add("selected");
				ComponentPlacer.instance.placeComponent(new WireComponent())
			},
			{ passive: false }
		);
		this.modeSwitchButtons.modeEraser.addEventListener(
			"click",
			() => this.switchMode(Modes.ERASE),
			{ passive: false }
		);
	}

	private addShapeComponentsToOffcanvas(leftOffcanvasAccordion:HTMLDivElement, leftOffcanvasOC:Offcanvas){
		// Add shapes accordion area
		let groupName = "Shapes"
		const collapseGroupID = "collapseGroup-" + groupName.replace(/[^\d\w\-\_]+/gi, "-");

		const accordionGroup = leftOffcanvasAccordion.appendChild(document.createElement("div"));
		accordionGroup.classList.add("accordion-item");

		const accordionItemHeader = accordionGroup.appendChild(document.createElement("h2"));
		accordionItemHeader.classList.add("accordion-header");

		const accordionItemButton = accordionItemHeader.appendChild(document.createElement("button"));
		accordionItemButton.classList.add("accordion-button");
		accordionItemButton.innerText = groupName;
		accordionItemButton.setAttribute("aria-controls", collapseGroupID);
		accordionItemButton.setAttribute("aria-expanded", "true");
		accordionItemButton.setAttribute("data-bs-target", "#" + collapseGroupID);
		accordionItemButton.setAttribute("data-bs-toggle", "collapse");
		accordionItemButton.type = "button";

		const accordionItemCollapse = accordionGroup.appendChild(document.createElement("div"));
		accordionItemCollapse.classList.add("accordion-collapse", "collapse", "show");
		accordionItemCollapse.id = collapseGroupID;
		accordionItemCollapse.setAttribute("data-bs-parent", "#leftOffcanvasAccordion");

		const accordionItemBody = accordionItemCollapse.appendChild(document.createElement("div"));
		accordionItemBody.classList.add("accordion-body", "iconLibAccordionBody");

		//Add rectangle
		{
			const addButton: HTMLDivElement = accordionItemBody.appendChild(document.createElement("div"));
			addButton.classList.add("libComponent");
			addButton.setAttribute("searchData","rect rectangle")
			addButton.ariaRoleDescription = "button";
			addButton.title = "Rectangle";
	
			const listener = (ev: MouseEvent) => {
				ev.preventDefault();
				this.switchMode(Modes.COMPONENT)					
	
				if (ComponentPlacer.instance.component) {
					ComponentPlacer.instance.placeCancel()
				}
	
				let newComponent = new RectangleComponent()
				ComponentPlacer.instance.placeComponent(newComponent)
				
				leftOffcanvasOC.hide();
			};
	
			addButton.addEventListener("mouseup", listener);
			addButton.addEventListener("touchstart", listener, { passive: false });
	
			let svgIcon = SVG.SVG().addTo(addButton)
			svgIcon.viewbox(0,0,17,12)
			svgIcon.rect(15,10).move(1,1).fill("none").stroke({
				color:"var(--bs-emphasis-color)",
				width:1
			})
		}
	}

	/**
	 * Init the left add offcanvas.
	 */
	private async initAddComponentOffcanvas() {
		const leftOffcanvas: HTMLDivElement = document.getElementById("leftOffcanvas") as HTMLDivElement;
		const leftOffcanvasOC = new Offcanvas(leftOffcanvas);
		document.getElementById("componentFilterInput").addEventListener("input",this.filterComponents);

		const addComponentButton: HTMLAnchorElement = document.getElementById("addComponentButton") as HTMLAnchorElement;
		addComponentButton.addEventListener(
			"click",
			((ev:PointerEvent) => {
				this.switchMode(Modes.DRAG_PAN);
				leftOffcanvasOC.toggle();				
				if (leftOffcanvas.classList.contains("showing")&&ev.pointerType!=="touch") {
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

		this.addShapeComponentsToOffcanvas(leftOffcanvasAccordion, leftOffcanvasOC)

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
					this.switchMode(Modes.COMPONENT)					

					if (ComponentPlacer.instance.component) {
						ComponentPlacer.instance.placeCancel()
					}

					let newComponent: CircuitikzComponent
					if (symbol.isNodeSymbol) {
						newComponent = new NodeComponent(symbol)
					}else{
						newComponent = new PathComponent(symbol)
					}					
					ComponentPlacer.instance.placeComponent(newComponent)
					
					leftOffcanvasOC.hide();
				};

				addButton.addEventListener("mouseup", listener);
				addButton.addEventListener("touchstart", listener, { passive: false });

				let svgIcon = SVG.SVG().addTo(addButton)
				if (symbol.viewBox) {
					svgIcon.viewbox(symbol.viewBox).width(symbol.viewBox.width).height(symbol.viewBox.height)
				}
				svgIcon.use(symbol.id())
			}

			firstGroup = false;
		}		
	}

	/**
	 * filter the components in the left OffCanvas to only show what matches the search string (in a new accordeon item)
	 */
	private filterComponents(evt: Event){
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
	 */
	public switchMode(newMode: Modes) {
		if (newMode == this.mode) return;
		let oldMode = this.mode
		this.mode=newMode
		
		switch (oldMode) {
			case Modes.DRAG_PAN:
				this.modeSwitchButtons.modeDragPan.classList.remove("selected");
				CanvasController.instance.deactivatePanning();
				SelectionController.instance.deactivateSelection();
				for (const instance of this.circuitComponents) {
					instance.draggable(false);
				}
				break;
			case Modes.ERASE:
				this.modeSwitchButtons.modeEraser.classList.remove("selected");
				EraseController.instance.deactivate();
				break;
			case Modes.COMPONENT:
				this.modeSwitchButtons.modeDragPan.classList.remove("selected");
				this.modeSwitchButtons.modeDrawLine.classList.remove("selected");
				ComponentPlacer.instance.placeCancel()
				CanvasController.instance.deactivatePanning();
				break;
			default:
				break;
		}

		switch (newMode) {
			case Modes.DRAG_PAN:
				this.modeSwitchButtons.modeDragPan.classList.add("selected");
				CanvasController.instance.activatePanning();
				SelectionController.instance.activateSelection();
				for (const instance of this.circuitComponents) {
					instance.draggable(true);
				}
				break;
			case Modes.ERASE:
				this.modeSwitchButtons.modeEraser.classList.add("selected");
				EraseController.instance.activate();
				break;
			case Modes.COMPONENT:
				this.modeSwitchButtons.modeDragPan.classList.add("selected");
				CanvasController.instance.activatePanning();
				break;
			default:
				break;
		}
	}

	public updateTheme(){
		if (this.darkModeLast==this.darkMode) {
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

		for (const instance of this.circuitComponents) {
			instance.updateTheme()
		}
		SelectionController.instance.updateTheme()

		this.darkModeLast = this.darkMode
	}

	/**
	 * add missing fill attributes to all symbol db entries where fill is undefined --> needs explicit setting, otherwise the color theme change does strange things.
	 * called once on initialization
	 * @param {Element} node 
	 */
	private addFill(node: Element){
		let hasFill = node.getAttribute("fill") !==null;
		if (hasFill) {
			return;
		}
		for (const element of node.children) {
			if (element.nodeName === "g") {
				this.addFill(element)
			}else{
				if (!element.getAttribute("fill")) {
					element.setAttribute("fill","#000")
				}
			}
		}
	}

	/**
	 * Adds a new instance to {@link circuitComponents} and adds its snapping points.
	 */
	public addComponent(circuitComponent: CircuitComponent) {
		this.circuitComponents.push(circuitComponent);
	}

	/**
	 * Removes an instance from {@link instances} and also removes its snapping points.
	 */
	public removeComponent(circuitComponent: CircuitComponent) {
		const idx = this.circuitComponents.indexOf(circuitComponent);
		if (idx>-1) {
			this.circuitComponents.splice(idx, 1);
			circuitComponent.remove();
		}
	}
}
