import {
	AbstractConstructor,
	CircuitComponent,
	PropertyCategories,
	SectionHeaderProperty,
	ComponentSaveObject,
	TextProperty,
	MainController,
	ExportController,
} from "../internal"

/**
 * names cannot contain punctuation, parentheses and some other symbols
 */
const invalidNameRegEx = /[\t\r\n\v.,:;()-]/

export function Nameable<TBase extends AbstractConstructor<CircuitComponent>>(Base: TBase) {
	abstract class Nameable extends Base {
		/**
		 * What will be used as the reference name in the tikz code (e.g. "\node[] (name) at (0,0){};"").
		 * Not used for all components, e.g. wire
		 */
		public name: TextProperty

		constructor(...args: any[]) {
			super(...args)
			const validator = (text: string) => {
				if (text === "") {
					// no name is always valid
					return ""
				}
				if (text.match(invalidNameRegEx)) {
					// check if characters are valid
					return "Contains forbidden characters!"
				}
				for (const component of MainController.instance.circuitComponents) {
					// check if another component with the same name already exists
					if (component != this && "name" in component) {
						let otherName = component.name as TextProperty
						if (text !== "" && otherName.value == text) {
							return "Name is already taken!"
						}
					}
				}
				return ""
			}
			this.name = new TextProperty("Name", "", "", validator)
			this.properties.add(PropertyCategories.info, new SectionHeaderProperty("TikZ name"))
			this.properties.add(PropertyCategories.info, this.name)
		}

		public toJson(): ComponentSaveObject {
			const data = super.toJson() as ComponentSaveObject & { name?: string }

			if (this.name.value && this.name.value != "") {
				data.name = this.name.value
			}

			return data
		}

		protected applyJson(saveObject: ComponentSaveObject & { name?: string }): void {
			super.applyJson(saveObject)
			if (saveObject.name) {
				this.name.updateValue(saveObject.name, true)
			}
		}

		protected buildTikzName(ensureID = true): string {
			let id = this.name.value
			if (!id && ensureID) {
				id = ExportController.instance.createExportID("N")
			}
			return id
		}
	}
	return Nameable
}
