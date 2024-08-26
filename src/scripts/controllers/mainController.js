/**
 * @module mainController
 */

import * as SVG from "@svgdotjs/svg.js";
import { Button as _bootstrapButton, Collapse as _bootstrapCollapse, Offcanvas, Tooltip } from "bootstrap";
import "../utils/impSVGNumber";
import { waitForElementLoaded } from "../utils/domWatcher";
import hotkeys from 'hotkeys-js';
import {version} from '../../../package.json';

import { CanvasController, EraseController, SnapController, SnapCursorController, ExportController, SelectionController, SaveController, Undo, CopyPaste} from "../internal";
import { ComponentSymbol, NodeComponentSymbol, PathComponentSymbol, NodeComponentInstance, PathComponentInstance, LineDrawer, Line } from "../internal";

/** @typedef {import("../internal").ComponentInstance} ComponentInstance */

export class MainController {
	/** @type {?MainController} */
	static #instance = null;
	// controllers
	/** @type {?CanvasController} */
	canvasController = null;
	/** @type {?LineDrawer} */
	lineDrawer = null;
	/** @type {?EraseController} */
	eraseController = null;
	/** @type {?ExportController} */
	exportController = null;
	/** @type {?SaveController} */
	saveController = null;

	/** @type {SVG.Svg} */
	symbolsSVG;
	/** @type {ComponentSymbol[]} */
	symbols;

	darkMode = false;
	#darkModeLast = false;
	#currentTheme = "dark";

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
	initPromise;
	/** @type {boolean} */
	isInitDone = false;

	/** @type {ComponentInstance[]} */
	instances = [];
	/** @type {Line[]} */
	lines = [];

	static appVersion = "0.0.0";

	isMac = false

	/**
	 * Init the app.
	 */
	constructor() {
		this.isMac = window.navigator.userAgent.toUpperCase().indexOf('MAC')>=0

		// dark mode init
		const htmlElement = document.documentElement;
		htmlElement.setAttribute('data-bs-theme', this.#currentTheme);
		const defaultTheme = window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
		console.log("Default "+defaultTheme);
		
		this.#currentTheme = localStorage.getItem('bsTheme') || defaultTheme;
		htmlElement.setAttribute('data-bs-theme', this.#currentTheme);
		this.#darkModeLast=false;
		this.darkMode = this.#currentTheme === 'dark';

		this.snapController = SnapController.controller;
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
		const exportCircuiTikZButton = document.getElementById("exportCircuiTikZButton");
		exportCircuiTikZButton.addEventListener(
			"click",
			this.exportController.exportCircuiTikZ.bind(this.exportController),
			{
				passive: true,
			}
		);

		/** @type {HTMLButtonElement} */
		const exportSVGButton = document.getElementById("exportSVGButton");
		exportSVGButton.addEventListener(
			"click",
			this.exportController.exportSVG.bind(this.exportController),
			{
				passive: true,
			}
		);
		
		this.saveController = new SaveController(this);
		/** @type {HTMLButtonElement} */
		const saveButton = document.getElementById("saveButton");
		saveButton.addEventListener(
			"click",
			this.saveController.save.bind(this.saveController),
			{
				passive: true,
			}
		);

		/** @type {HTMLButtonElement} */
		const loadButton = document.getElementById("loadButton");
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
		});
		this.initPromise = Promise.all([canvasPromise, symbolsDBPromise]).then(() => {
			new SnapCursorController(this.canvasController.canvas);
			this.#initAddComponentOffcanvas();
			this.#initShortcuts();
			let currentProgress = localStorage.getItem('currentProgress')
			if (currentProgress) {
				this.saveController.loadFromText(currentProgress)
			}else{
				Undo.addState()
			}
			this.isInitDone = true;

			// prepare symbolDB for colorTheme
			for (const g of this.symbolsSVG.defs().node.querySelectorAll("symbol>g")) {
				this.#addFill(g)
			}

			const htmlElement = document.documentElement;
			const switchElement = document.getElementById('darkModeSwitch');
			switchElement.checked = this.darkMode;
			switchElement.addEventListener('change', function () {
				if (MainController.controller.darkMode = switchElement.checked) {
					htmlElement.setAttribute('data-bs-theme', 'dark');
					localStorage.setItem('bsTheme', 'dark');
				} else {
					htmlElement.setAttribute('data-bs-theme', 'light');
					localStorage.setItem('bsTheme', 'light');
				}
				MainController.controller.updateTheme()
			});
			MainController.controller.updateTheme()
		});

		// Prevent "normal" browser menu
		document.body.addEventListener("contextmenu", (evt) => evt.preventDefault(), { passive: false });
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
	static get controller() {
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
		const symbolDBlink = await waitForElementLoaded("symbolDBlink");
		const response = await fetch(symbolDBlink.href, {
			method: "GET",
			// must match symbolDBlink cors options in order to actually use the preloaded file
			mode: "cors",
			credentials: "same-origin",
		});
		const textContent = await response.text();

		// Parse & add to DOM
		/** @type {XMLDocument} */
		const symbolsDocument = new DOMParser().parseFromString(textContent, "image/svg+xml");
		/** @type {SVGSVGElement} */
		const symbolsSVGSVGElement = document.adoptNode(symbolsDocument.firstElementChild);
		symbolsSVGSVGElement.style.display = "none";
		symbolsSVGSVGElement.setAttribute("id","symbolDB")
		document.body.appendChild(symbolsSVGSVGElement);

		// Extract symbols
		this.symbolsSVG = new SVG.Svg(symbolsSVGSVGElement);
		/** @type {SVG.Defs} */
		const defs = this.symbolsSVG.defs();
		/** @type {SVGSymbolElement[]} */
		const symbols = Array.prototype.filter.call(defs.node.children, (def) => def instanceof SVGSymbolElement);
		// let symbols = defs.children().filter((/** @type {SVG.Element} */def) => def instanceof SVG.Symbol);
		this.symbols = symbols.flatMap((symbol) => {
			const baseInfo = ComponentSymbol.getBaseInformation(symbol);
			if (baseInfo.isNode === baseInfo.isPath) return []; // type not correctly set
			try {
				if (baseInfo.isNode) return new NodeComponentSymbol(symbol, baseInfo);
				else return new PathComponentSymbol(symbol, baseInfo);
			} catch (/** @type {Error} */ e) {
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
		/** @type {HTMLDivElement} */
		const leftOffcanvas = document.getElementById("leftOffcanvas");
		const leftOffcanvasOC = new Offcanvas(leftOffcanvas);
		document.getElementById("componentFilterInput").addEventListener("input",this.filterComponents);
		// document.getElementById("componentFilterInput").addEventListener("keyup",(evt)=>{
		// 	// only "input" events should trigger the component filter. otherwise shortcuts are also triggered
		// 	evt.preventDefault();
		// 	evt.stopPropagation();
		// });

		/** @type {HTMLAnchorElement} */
		const addComponentButton = document.getElementById("addComponentButton");
		addComponentButton.addEventListener(
			"click",
			(() => {
				this.#switchMode(MainController.modes.DRAG_PAN);
				leftOffcanvasOC.toggle();
				// offcanvas refocuses itself on animation completion so this does not work. TODO find workaround
				document.getElementById("componentFilterInput").focus()
			}).bind(this),
			{ passive: true }
		);
		/** @type {HTMLDivElement} */
		const leftOffcanvasAccordion = document.getElementById("leftOffcanvasAccordion");

		/** @type {Map<string, ComponentSymbol[]>} */
		const groupedSymbols = this.symbols.reduce(
			/**
			 * @param {Map<string, ComponentSymbol[]>} groupedSymbols
			 * @param {ComponentSymbol} symbol
			 * @returns {Map<string, ComponentSymbol[]>}
			 */
			(groupedSymbols, symbol) => {
				const key = symbol.groupName || "Unsorted components";
				let group = groupedSymbols.get(key);
				if (group) group.push(symbol);
				else groupedSymbols.set(key, [symbol]);
				return groupedSymbols;
			},
			new Map()
		);

		/** @type {SVGSVGElement[]} */
		let iconsWithoutViewBox = [];
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
			accordionItemButton.setAttribute("aria-expanded", firstGroup);
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
				/** @type {HTMLDivElement} */
				const addButton = accordionItemBody.appendChild(document.createElement("div"));
				addButton.classList.add("libComponent");
				addButton.ariaRoleDescription = "button";
				addButton.title = symbol.displayName || symbol.tikzName;

				const listener = (ev) => {
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

					const newInstance = symbol.addInstanceToContainer(this.canvasController.canvas, ev, ()=>{this.#switchMode(MainController.modes.DRAG_PAN);});
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

				/** @type {SVGSVGElement} */
				const svgIcon = addButton.appendChild(document.createElementNS(SVG.namespaces.svg, "svg"));
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

				if (!symbol.viewBox) iconsWithoutViewBox.append(svgIcon);
			}

			if (firstGroup) firstGroup = false;
		}

		/**
		 *
		 * @param {DOMRect|null|undefined} box
		 * @returns {boolean}
		 */
		function isNullishBox(box) {
			return !box || (!box.x && !box.y && !box.width && !box.height);
		}

		while (iconsWithoutViewBox.length > 0 && isNullishBox(iconsWithoutViewBox[0].getBBox()))
			await new Promise((resolve) => requestAnimationFrame(resolve));

		iconsWithoutViewBox.forEach(async (svgIcon) => {
			/** @type {DOMRect} */
			let box;
			// wait for browser rendering and setting the bounding box
			while (isNullishBox((box = svgIcon.getBBox({ clipped: false, fill: true, markers: true, stroke: true }))))
				await new Promise((resolve) => requestAnimationFrame(resolve));

			svgIcon.setAttributeNS(null, "viewBox", box.x + " " + box.y + " " + box.width + " " + box.height);
			svgIcon.setAttributeNS(null, "width", box.width);
			svgIcon.setAttributeNS(null, "height", box.height);
		});
	}

	/**
	 * filter the components in the left OffCanvas to only show what matches the search string (in a new accordeon item)
	 * @param {Event} evt 
	 */
	filterComponents(evt){
		evt.preventDefault();
		evt.stopPropagation();

		
		const element = document.getElementById('componentFilterInput');
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
		Array.prototype.forEach.call(accordionItems,(/**@type {HTMLDivElement} */accordionItem,index)=>{
			const libComponents = accordionItem.getElementsByClassName("libComponent");
			let showCount = 0;
			Array.prototype.forEach.call(libComponents,(/**@type {HTMLDivElement} */libComponent)=>{
				if (text) {
					if (!regex.test(libComponent.title)) {
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
	#switchMode(newMode) {
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
	 * add missing fill attributes to all symbol db entries where fill is undefined --> needs explicit setting, otherwise the color theme change does strange things
	 * called once on initialization
	 * @param {Element} node 
	 */
	#addFill(node){
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
	addInstance(newInstance) {
		this.instances.push(newInstance);
		const snappingPoints = newInstance.snappingPoints || [];
		if (snappingPoints.length > 0) this.snapController.addSnapPoints(snappingPoints);
	}

	/**
	 * Adds a new line to {@link lines}.
	 *
	 * @param {Line} newLine - the line to add
	 */
	addLine(newLine) {
		this.lines.push(newLine);
	}

	/**
	 * Removes a instance from {@link instances} and also removes its snapping points.
	 *
	 * @param {ComponentInstance} instance - the instance to remove
	 */
	removeInstance(instance) {
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
	removeLine(line) {
		line.remove();
		const idx = this.lines.indexOf(line);
		if (idx >= 0) this.lines.splice(idx, 1);
	}
}
