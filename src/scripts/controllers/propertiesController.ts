import {
	AlignmentMode,
	ButtonGridProperty,
	CanvasController,
	CircuitComponent,
	DistributionMode,
	GroupComponent,
	MainController,
	SectionHeaderProperty,
	SelectionController,
	Undo,
} from "../internal"

export type FormEntry = {
	originalObject: object
	propertyName: string
	inputType: string
	currentValue: any
}

export class PropertyController {
	private static _instance: PropertyController
	public static get instance(): PropertyController {
		if (!PropertyController._instance) {
			PropertyController._instance = new PropertyController()
		}
		return PropertyController._instance
	}

	private viewProperties: HTMLDivElement
	private propertiesEntries: HTMLDivElement
	private propertiesTitle: HTMLElement

	private constructor() {
		this.propertiesTitle = document.getElementById("propertiesTitle") as HTMLElement
		this.viewProperties = document.getElementById("view-properties") as HTMLDivElement
		this.propertiesEntries = document.getElementById("propertiesEntries") as HTMLDivElement
	}

	update() {
		let components = SelectionController.instance.currentlySelectedComponents
		this.clearForm()

		if (components.length > 1) {
			this.setMultiForm(components)
		} else if (components.length === 1) {
			this.setForm(components[0])
		} else {
			this.setFormView()
		}

		MainController.instance.updateTooltips()
	}

	private setMultiForm(components: CircuitComponent[]) {
		//TODO multicomponent edit

		this.propertiesEntries.classList.remove("d-none")
		this.propertiesTitle.innerText = "Selection"

		let rows: HTMLElement[] = []
		let positioning = new ButtonGridProperty(
			2,
			[
				["Rotate 90° CW", "rotate_right"],
				["Rotate 90° CCW", "rotate_left"],
				["Rotate 45° CW", "rotate_right"],
				["Rotate 45° CCW", "rotate_left"],
				["Flip vertically", ["flip", "rotateText"]],
				["Flip horizontally", "flip"],
			],
			[
				(ev) => {
					SelectionController.instance.rotateSelection(-90)
					Undo.addState()
				},
				(ev) => {
					SelectionController.instance.rotateSelection(90)
					Undo.addState()
				},
				(ev) => {
					SelectionController.instance.rotateSelection(-45)
					Undo.addState()
				},
				(ev) => {
					SelectionController.instance.rotateSelection(45)
					Undo.addState()
				},
				(ev) => {
					SelectionController.instance.flipSelection(true)
					Undo.addState()
				},
				(ev) => {
					SelectionController.instance.flipSelection(false)
					Undo.addState()
				},
			]
		)
		rows.push(positioning.buildHTML())

		rows.push(new SectionHeaderProperty("Ordering").buildHTML())
		let ordering = new ButtonGridProperty(
			2,
			[
				["Foreground", ""],
				["Background", ""],
				["Forward", ""],
				["Backward", ""],
			],
			[
				(ev) =>
					CanvasController.instance.componentsToForeground(
						SelectionController.instance.currentlySelectedComponents
					),
				(ev) =>
					CanvasController.instance.componentsToBackground(
						SelectionController.instance.currentlySelectedComponents
					),
				(ev) =>
					CanvasController.instance.moveComponentsForward(
						SelectionController.instance.currentlySelectedComponents
					),
				(ev) =>
					CanvasController.instance.moveComponentsBackward(
						SelectionController.instance.currentlySelectedComponents
					),
			]
		)
		rows.push(ordering.buildHTML())

		rows.push(new SectionHeaderProperty("Grouping").buildHTML())
		let grouping = new ButtonGridProperty(
			1,
			[["Group", ""]],
			[(ev) => GroupComponent.group(SelectionController.instance.currentlySelectedComponents)]
		)
		rows.push(grouping.buildHTML())

		rows.push(new SectionHeaderProperty("Align").buildHTML())
		let alignment = new ButtonGridProperty(
			3,
			[
				["", "align_horizontal_left"],
				["", "align_horizontal_center"],
				["", "align_horizontal_right"],
				["", "align_vertical_top"],
				["", "align_vertical_center"],
				["", "align_vertical_bottom"],
			],
			[
				(ev) => SelectionController.instance.alignSelection(AlignmentMode.START, true),
				(ev) => SelectionController.instance.alignSelection(AlignmentMode.CENTER, true),
				(ev) => SelectionController.instance.alignSelection(AlignmentMode.END, true),
				(ev) => SelectionController.instance.alignSelection(AlignmentMode.START, false),
				(ev) => SelectionController.instance.alignSelection(AlignmentMode.CENTER, false),
				(ev) => SelectionController.instance.alignSelection(AlignmentMode.END, false),
			]
		)
		rows.push(alignment.buildHTML())

		rows.push(new SectionHeaderProperty("Distribute").buildHTML())
		let distribute = new ButtonGridProperty(
			2,
			[
				["Center", "horizontal_distribute"],
				["Spacing", "align_justify_space_even"],
				["Center", "vertical_distribute"],
				["Spacing", "align_space_even"],
			],
			[
				(ev) => SelectionController.instance.distributeSelection(DistributionMode.CENTER, true),
				(ev) => SelectionController.instance.distributeSelection(DistributionMode.SPACE, true),
				(ev) => SelectionController.instance.distributeSelection(DistributionMode.CENTER, false),
				(ev) => SelectionController.instance.distributeSelection(DistributionMode.SPACE, false),
			]
		)
		rows.push(distribute.buildHTML())

		this.propertiesEntries.append(...rows)
	}

	private setForm(component: CircuitComponent) {
		this.propertiesEntries.classList.remove("d-none")
		this.propertiesTitle.innerText = component.displayName
		this.propertiesEntries.append(...component.propertiesHTMLRows)
	}

	private setFormView() {
		this.viewProperties.classList.remove("d-none")
		this.propertiesTitle.innerText = "View settings"
		;(document.getElementById("resetViewButton") as HTMLButtonElement).addEventListener("click", (ev) => {
			CanvasController.instance.resetView()
		})
		;(document.getElementById("fitViewButton") as HTMLButtonElement).addEventListener("click", (ev) => {
			CanvasController.instance.fitView()
		})

		let minorSlider = document.getElementById("minorSliderInput") as HTMLInputElement
		minorSlider.value = CanvasController.instance.majorGridSubdivisions.toString()

		let majorSlider = document.getElementById("majorSliderInput") as HTMLInputElement
		majorSlider.value = CanvasController.instance.majorGridSizecm.toString()

		minorSlider.addEventListener("input", (ev) => {
			this.changeGrid(CanvasController.instance.majorGridSizecm, Number.parseFloat(minorSlider.value))
		})

		majorSlider.addEventListener("input", (ev) => {
			this.changeGrid(Number.parseFloat(majorSlider.value), CanvasController.instance.majorGridSubdivisions)
		})

		this.changeGrid(CanvasController.instance.majorGridSizecm, CanvasController.instance.majorGridSubdivisions)
	}

	public setSliderValues(majorSizecm: number, majorSubdivisions: number) {
		let minorSlider = document.getElementById("minorSliderInput") as HTMLInputElement
		minorSlider.value = majorSubdivisions.toString()
		let majorSlider = document.getElementById("majorSliderInput") as HTMLInputElement
		majorSlider.value = majorSizecm.toString()
		this.changeGrid(majorSizecm, majorSubdivisions)
	}

	private changeGrid(majorSizecm: number, majorSubdivisions: number) {
		CanvasController.instance.changeGrid(majorSizecm, majorSubdivisions)

		let majorLabel = document.getElementById("majorLabel")
		majorLabel.innerText = majorSizecm + " cm"

		let minorLabel = document.getElementById("minorLabel")
		minorLabel.innerText = majorSubdivisions.toString()

		let gridInfo = document.getElementById("gridInfo")
		gridInfo.innerText =
			(majorSizecm / majorSubdivisions).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " cm"
	}

	private clearForm() {
		this.propertiesTitle.innerText = "Properties"
		this.viewProperties.classList.add("d-none")
		this.propertiesEntries.classList.add("d-none")
		this.propertiesEntries.innerText = ""

		while (this.propertiesEntries.lastElementChild) {
			this.propertiesEntries.removeChild(this.propertiesEntries.lastElementChild)
		}
	}
}
