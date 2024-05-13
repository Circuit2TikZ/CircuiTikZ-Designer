/**
 * @module mainController
 */

import * as SVG from "@svgdotjs/svg.js";
import { Button as _bootstrapButton, Collapse as _bootstrapCollapse, Offcanvas, Tooltip } from "bootstrap";

import "../utils/impSVGNumber";
import CanvasController from "./canvasController";
import ComponentSymbol from "../components/componentSymbol";
import EraseController from "./eraseController";
import LineDrawer from "../lines/lineDrawer";
import NodeComponentSymbol from "../components/nodeComponentSymbol";
import PathComponentSymbol from "../components/pathComponentSymbol";
import SnapController from "../snapDrag/snapController";
import SnapCursorController from "../snapDrag/snapCursor";
import { waitForElementLoaded } from "../utils/domWatcher";
import ExportController from "./exportController";
import PathComponentInstance from "../components/pathComponentInstance";

/** @typedef {import("../components/componentInstance").ComponentInstance} ComponentInstance */
/** @typedef {import("../lines/line").default} Line */

export default class MainController {
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

	/** @type {SVG.Svg} */
	symbolsSVG;
	/** @type {ComponentSymbol[]} */
	symbols;

	/**
	 * @readonly
	 * @enum {number}
	 */
	static modes = {
		DRAG_PAN: 1,
		DRAW_LINE: 2,
		ERASE: 3,
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

	/**
	 * Init the app.
	 */
	constructor() {
		this.snapController = SnapController.controller;
		let canvasPromise = this.#initCanvas();
		let symbolsDBPromise = this.#initSymbolDB();

		this.#initModeButtons();

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

		canvasPromise.then(() => {
			this.lineDrawer = new LineDrawer(this);
			this.eraseController = new EraseController(this);
		});
		this.initPromise = Promise.all([canvasPromise, symbolsDBPromise]).then(() => {
			new SnapCursorController(this.canvasController.canvas);
			this.#initAddComponentOffcanvas();
			this.isInitDone = true;
		});

		// Prevent "normal" browser menu
		document.body.addEventListener("contextmenu", (evt) => evt.preventDefault(), { passive: false });

		this.#initShortcuts();

		//enable tooltips globally
		const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
		const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new Tooltip(tooltipTriggerEl,{
			fallbackPlacements:[] //always show them exactly where defined
		}))
	}

	/**
	 * initialises keyboard shortcuts
	 */
	#initShortcuts(){
		//handle basic shortcuts for paning (Esc), line drawing (W) and erasing (E, Del)
		document.body.addEventListener('keyup', (e) => {
			// shouldn't active if altkey, ctrl or shift is pressed
			if (e.altKey || e.ctrlKey || e.shiftKey) {
				return;
			}
			switch (e.code) {
				case 'Escape':
					this.#switchMode(MainController.modes.DRAG_PAN);
					break;
				case 'KeyW':
					this.#switchMode(MainController.modes.DRAW_LINE);
					break;
				case 'Delete':
				case 'KeyE':
					this.#switchMode(MainController.modes.ERASE);
					break;
				default:
					break;
			}
		}, false);

		// handle shortcuts for adding components
		// shortcutDict maps the Shortcut key to the title attribute of the html element where the callback can be found
		var shortcutDict = {
			"g":"ground",
			"r":"resistor",
			"c":"capacitor",
			"l":"inductor (american)",
			"z":"jump crossing",
			"x":"plain crossing",
			"t":"nmos",
			".":"circ",
		}
		// when a valid shortcut button is pressed, simulate a click on the corresponding button for the component
		document.body.addEventListener('keyup', (e) => {
			var componentTitleName = shortcutDict[e.key]
			if(componentTitleName){
				this.#switchMode(MainController.modes.DRAG_PAN); //switch to standard mode to avoid weird states
				var componentButton = document.querySelector('[title="'+componentTitleName+'"]')
				var clickEvent = new MouseEvent('mousedown',{view:window,bubbles:true,cancelable:true,});
				componentButton?.dispatchEvent(clickEvent);
			}
		});
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
		document.getElementById("componentFilterInput").addEventListener("keyup",(evt)=>{
			evt.preventDefault();
			evt.stopPropagation();
		});

		/** @type {HTMLAnchorElement} */
		const addComponentButton = document.getElementById("addComponentButton");
		addComponentButton.addEventListener(
			"click",
			(() => {
				this.#switchMode(MainController.modes.DRAG_PAN);
				leftOffcanvasOC.toggle();
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
					// ev.stopPropagation();
					const oldComponent = this.canvasController.placingComponent;
					let lastpoint = null;
					if (oldComponent) {
						// if currently placing a component, use the new component instead and remove the old component
						if ((oldComponent instanceof PathComponentInstance) && oldComponent.getPointsSet()==1) {
							lastpoint = oldComponent.getStartPoint();
							oldComponent.emulateSecondClick(); //cleanly finish placing the oldComponent somewhere before deleting it
						}
						this.removeInstance(oldComponent);
					}
					const newInstance = symbol.addInstanceToContainer(this.canvasController.canvas, ev);
					if (lastpoint && (newInstance instanceof PathComponentInstance)) {
						newInstance.emulateFirstClick(lastpoint);
					}
					this.canvasController.placingComponent = newInstance;
					this.addInstance(newInstance);
					leftOffcanvasOC.hide();
					
				};

				addButton.addEventListener("mousedown", listener);
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

		let text = document.getElementById('componentFilterInput').value;

		const accordion = document.getElementById("leftOffcanvasAccordion");

		const accordionItems = accordion.getElementsByClassName("accordion-item");
		Array.prototype.forEach.call(accordionItems,(/**@type {HTMLDivElement} */accordionItem,index)=>{
			const libComponents = accordionItem.getElementsByClassName("libComponent");
			let showCount = 0;
			Array.prototype.forEach.call(libComponents,(/**@type {HTMLDivElement} */libComponent)=>{
				if (text) {
					if (libComponent.title.search(text)<0) {
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
			default:
				break;
		}

		switch (newMode) {
			case MainController.modes.DRAG_PAN:
				this.#modeSwitchButtons.modeDragPan.classList.add("selected");
				this.canvasController.activatePanning();
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
			default:
				break;
		}

		this.mode = newMode;
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
