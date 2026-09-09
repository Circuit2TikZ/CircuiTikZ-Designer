import {
	ButtonGridProperty,
	ChoiceEntry,
	ChoiceProperty,
	DocumentBaseFontSize,
	getBaseFontSize,
	MainController,
	SectionHeaderProperty,
	setBaseFontSize,
} from "../internal"

export type StylePreset = "default" | "american" | "european"

type TikzSetting = {
	environment: string[]
	ctikzset: string[]
}

export type GlobalTikzSettings = Record<OptionsChoice, string>

// export type GlobalSettings = {
// 	voltageStyle?: "american" | "european" | "straight" | "raised"
// 	currentStyle?: "american" | "european"
// 	voltageConvention?: "old" |"noold" |"RP" |"EF"
// }

type OptionsChoice =
	| "voltages"
	// | "currents"
	// | "resistors"
	// | "inductors"
	// | "logic"
	| "voltageConvention"
	| "labelOrientation"

type GlobalOption = {
	key: OptionsChoice
	name: string
	tikz: "environment" | "ctikzset"
	choices: { key: string; name: string; tikz: string }[]
}

// const globalSettings:Record<OptionsChoice, GlobalOption> = {} as any

const voltageOption: GlobalOption = {
	key: "voltages",
	name: "Voltage Style",
	tikz: "environment",
	choices: [
		{ key: "american", name: "American Voltages", tikz: "american voltages" },
		{ key: "european", name: "European Voltages", tikz: "european voltages" },
		{ key: "straight", name: "Straight Voltages", tikz: "straight voltages" },
		{ key: "raised", name: "Raised Voltages", tikz: "raised voltages" },
	],
}

// const currentOption: GlobalOption = {
// 	key: "currents",
// 	name: "Current Style",
// 	tikz: "environment",
// 	choices: [
// 		{ key: "american", name: "American Currents", tikz: "american currents" },
// 		{ key: "european", name: "European Currents", tikz: "european currents" },
// 	],
// }

// const resistorOption: GlobalOption = {
// 	key: "resistors",
// 	name: "Resistor Style",
// 	tikz: "environment",
// 	choices: [
// 		{ key: "american", name: "American Resistors", tikz: "american resistors" },
// 		{ key: "european", name: "European Resistors", tikz: "european resistors" },
// 	],
// }

// const inductorOption: GlobalOption = {
// 	key: "inductors",
// 	name: "Inductor Style",
// 	tikz: "environment",
// 	choices: [
// 		{ key: "cute", name: "Cute Inductors", tikz: "cute inductors" },
// 		{ key: "american", name: "American Inductors", tikz: "american inductors" },
// 		{ key: "european", name: "European Inductors", tikz: "european inductors" },
// 	],
// }

// const logicOption: GlobalOption = {
// 	key: "logic",
// 	name: "Logic Style",
// 	tikz: "environment",
// 	choices: [
// 		{ key: "american", name: "American Logic Gates", tikz: "american ports" },
// 		{ key: "european", name: "European Logic Gates", tikz: "european ports" },
// 		{ key: "ieeestd", name: "IEEE Std Logic Gates", tikz: "ieeestd ports" },
// 	],
// }

const voltageConventionOption: GlobalOption = {
	key: "voltageConvention",
	name: "Voltage Convention",
	tikz: "environment",
	choices: [
		{ key: "old", name: "Old Voltage Direction Convention", tikz: "voltage dir=old" },
		{ key: "RP", name: "RP Voltage Direction Convention", tikz: "voltage dir=RP" },
		{ key: "EF", name: "EF Voltage Direction Convention", tikz: "voltage dir=EF" },
		{ key: "noold", name: "No Old Voltage Direction Convention", tikz: "voltage dir=nold" },
	],
}

const labelOrientationOption: GlobalOption = {
	key: "labelOrientation",
	name: "Label Orientation",
	tikz: "ctikzset",
	choices: [
		{ key: "smart", name: "Smart Label Orientation", tikz: "label/align=smart" },
		{ key: "rotate", name: "Rotated Label Orientation", tikz: "label/align=rotate" },
		{ key: "straight", name: "Straight Label Orientation", tikz: "label/align=straight" },
	],
}

// the base font size (LaTeX \documentclass option) of the document the exported diagram is designed to be
// included in. unlike the options above, this is not a tikzpicture option: it only determines the pt sizes
// used to preview \tiny .. \Huge text on the canvas (see setBaseFontSize), so that they match once the
// exported code (which keeps using the relative \tiny .. \Huge commands) is embedded in a document with the
// same base font size.
type BaseFontSizeChoice = ChoiceEntry & { pt: DocumentBaseFontSize }
const baseFontSizeChoices: BaseFontSizeChoice[] = [
	{ key: "10", name: "10pt (default)", pt: 10 },
	{ key: "11", name: "11pt", pt: 11 },
	{ key: "12", name: "12pt", pt: 12 },
]

const STYLE_PRESETS: Record<StylePreset, Partial<Record<OptionsChoice, string>>> = {
	default: {
		voltages: "european",
		// currents: "european",
		// resistors: "american",
		// inductors: "cute",
		// logic: "american",
		voltageConvention: "noold",
		labelOrientation: "smart",
	},
	american: {
		// currents: "american",
		voltages: "american",
		// resistors: "american",
		// inductors: "american",
		// logic: "american",
	},
	european: {
		// currents: "european",
		voltages: "european",
		// resistors: "european",
		// inductors: "european",
		// logic: "european",
	},
}

export class EnvironmentVariableController {
	private static _instance: EnvironmentVariableController

	private globalSettings: GlobalTikzSettings

	private htmlElement: HTMLDivElement

	private propertyMap: Map<OptionsChoice, ChoiceProperty<ChoiceEntry>> = new Map()
	private optionsMap: Map<OptionsChoice, GlobalOption> = new Map()

	private baseFontSizeProperty: ChoiceProperty<BaseFontSizeChoice>

	public static get instance(): EnvironmentVariableController {
		if (!EnvironmentVariableController._instance) {
			EnvironmentVariableController._instance = new EnvironmentVariableController()
		}
		return EnvironmentVariableController._instance
	}

	private constructor() {
		// Initialization code here

		const allOptions = [
			voltageOption,
			// currentOption,
			// resistorOption,
			// inductorOption,
			// logicOption,
			voltageConventionOption,
			labelOrientationOption,
		]

		let defaults = STYLE_PRESETS["default"]

		this.globalSettings = {} as GlobalTikzSettings

		for (const option of allOptions) {
			let choiceProperty = new ChoiceProperty(
				option.name,
				option.choices,
				option.choices.find((choice) => choice.key === defaults[option.key])
			)
			this.propertyMap.set(option.key, choiceProperty)

			this.globalSettings[option.key] = defaults[option.key]

			choiceProperty.addChangeListener((ev) => {
				this.globalSettings[option.key] = ev.value.key
				this.updateComponents()
			})

			this.optionsMap.set(option.key, option)
		}

		this.baseFontSizeProperty = new ChoiceProperty(
			"Base Font Size",
			baseFontSizeChoices,
			baseFontSizeChoices.find((choice) => choice.pt === getBaseFontSize()),
			"The base font size of the document this diagram will be included in (the \\documentclass[...] option). " +
				"Text on the canvas and the \\tiny .. \\Huge commands in the exported code are sized to match, so they " +
				"come out correctly once the diagram is embedded in a document using this base font size.",
			"baseFontSize"
		)
		this.baseFontSizeProperty.addChangeListener((ev) => {
			setBaseFontSize(ev.value.pt)
			this.updateComponents()
		})
	}

	public getGlobalSettings(): GlobalTikzSettings {
		return this.globalSettings
	}

	private updateComponents() {
		for (const key of this.propertyMap.keys()) {
			this.globalSettings[key as OptionsChoice] = this.propertyMap.get(key as OptionsChoice).value.key
		}
		MainController.instance.circuitComponents.forEach((component) => {
			component.update()
		})
	}

	private applyStylePreset = (style: StylePreset) => {
		let preset = STYLE_PRESETS[style]
		for (const key of Object.keys(preset)) {
			const property = this.propertyMap.get(key as OptionsChoice)
			property.updateValue(
				property.entries.find((entry) => entry.key === preset[key as OptionsChoice]),
				true,
				false
			)
		}
		this.updateComponents()
	}

	public getHTML(): HTMLDivElement {
		if (this.htmlElement) return this.htmlElement

		this.htmlElement = document.createElement("div")
		this.htmlElement.id = "envVarView"
		this.htmlElement.classList.add("container-fluid", "w-100", "m-0", "gap-3", "px-0")

		this.htmlElement.appendChild(new SectionHeaderProperty("Document Font Size").getHTMLElement())
		this.htmlElement.appendChild(this.baseFontSizeProperty.getHTMLElement())

		this.htmlElement.appendChild(new SectionHeaderProperty("Environment Variable Presets").getHTMLElement())
		let presetButtons = new ButtonGridProperty(
			3,
			[
				["Default", "reset_settings"],
				["American", "attach_money"],
				["European", "euro"],
			],
			[
				(ev) => {
					this.applyStylePreset("default")
				},
				(ev) => {
					this.applyStylePreset("american")
				},
				(ev) => {
					this.applyStylePreset("european")
				},
			]
		)

		this.htmlElement.appendChild(presetButtons.getHTMLElement())

		this.htmlElement.appendChild(new SectionHeaderProperty("Change environment variables").getHTMLElement())
		for (const property of this.propertyMap.values()) {
			this.htmlElement.appendChild(property.getHTMLElement())
		}

		return this.htmlElement
	}

	public getTikzSettings(): TikzSetting {
		let environment: string[] = []
		let ctikzset: string[] = []

		let defaults = STYLE_PRESETS["default"]
		for (const key of Object.keys(defaults)) {
			if (defaults[key] !== this.globalSettings[key as OptionsChoice]) {
				if (this.optionsMap.get(key as OptionsChoice).tikz === "environment") {
					environment.push(
						this.optionsMap
							.get(key as OptionsChoice)
							.choices.find((choice) => choice.key === this.globalSettings[key as OptionsChoice])!.tikz
					)
				} else {
					ctikzset.push(
						this.optionsMap
							.get(key as OptionsChoice)
							.choices.find((choice) => choice.key === this.globalSettings[key as OptionsChoice])!.tikz
					)
				}
			}
		}

		return { environment, ctikzset }
	}

	public toJson() {
		let saveSettings: GlobalTikzSettings = {} as GlobalTikzSettings
		let defaults = STYLE_PRESETS["default"]
		for (const key of Object.keys(this.globalSettings)) {
			if (this.globalSettings[key as OptionsChoice] !== defaults[key as OptionsChoice]) {
				saveSettings[key as OptionsChoice] = this.globalSettings[key as OptionsChoice]
			}
		}
		return saveSettings
	}

	public fromJson(saveSettings: GlobalTikzSettings) {
		let defaults = STYLE_PRESETS["default"]
		Object.assign(this.globalSettings, defaults)
		Object.assign(this.globalSettings, saveSettings)
		for (const key of Object.keys(this.globalSettings)) {
			let property = this.propertyMap.get(key as OptionsChoice)
			property.updateValue(
				property.entries.find((entry) => entry.key === this.globalSettings[key as OptionsChoice]),
				true,
				false
			)
		}
	}

	// undefined means "10pt (default)", matching the other settings' convention of omitting values at their default
	public getBaseFontSizeJson(): string | undefined {
		const current = this.baseFontSizeProperty.value
		return current.pt === baseFontSizeChoices[0].pt ? undefined : current.key
	}

	public setBaseFontSizeFromJson(key: string | undefined) {
		const choice = baseFontSizeChoices.find((entry) => entry.key === key) ?? baseFontSizeChoices[0]
		this.baseFontSizeProperty.updateValue(choice, true, false)
		setBaseFontSize(choice.pt)
	}
}
