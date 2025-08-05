import * as SVG from "@svgdotjs/svg.js"

export type TikzNode = {
	options: string[]
	name?: string
	position: string | SVG.Point
	content?: string
	additionalNodes: TikzNode[]
}

export type CircuitikzTo = {
	options: string[]
	name?: string
}

export type TikzPath = {
	options: string[]
	coordinates: (string | SVG.Point)[]
	connectors: (string | CircuitikzTo)[]
}

export function buildTikzNodeCommand(command: TikzNode): string {
	let outputString: string[] = ["\\node"]

	if (command.options.length > 0) {
		outputString.push("[" + command.options.join(", ") + "]")
	}

	if (command.name) {
		outputString.push("(" + command.name + ")")
	}
	outputString.push(" at ")
	outputString.push(coordToString(command.position))
	outputString.push("{" + (command.content ?? "") + "}")

	for (const additionalCommand of command.additionalNodes) {
		outputString.push(" " + buildTikzNodeCommand(additionalCommand))
	}

	return outputString.join("") + ";"
}

export function buildTikzPathCommand(command: TikzPath): string {
	if (command.coordinates.length !== command.connectors.length - 1) {
		throw new Error(
			"Building path command failed! Number of coordinates has to be one more than number of coordinate connectors"
		)
	}
	if (command.coordinates.length < 2) {
		throw new Error("Building path command failed! Number of coordinates has to be at least 2")
	}
	let outputString: string[] = ["\\path"]
	if (command.options.length > 0) {
		outputString.push("[" + command.options.join(", ") + "]")
	}

	for (let index = 0; index < command.connectors.length; index++) {
		const coordinate = command.coordinates[index]
		const connector = command.connectors[index]

		outputString.push(" " + coordToString(coordinate))
		if (typeof connector == "string") {
			outputString.push(" " + connector)
		} else {
			outputString.push(" " + buildCircuitikzTo(connector))
		}
	}

	outputString.push(coordToString(command.coordinates.at(-1)))

	return outputString.join("") + ";"
}

function coordToString(coord: string | SVG.Point) {
	if (typeof coord == "string") {
		return "(" + coord + ")"
	} else {
		return coord.toTikzString()
	}
}

function buildCircuitikzTo(command: CircuitikzTo): string {
	let outputString: string[] = [...command.options]

	if (command.name) {
		outputString.push("name=" + command.name)
	}

	return "to[" + outputString.join(", ") + "]"
}
