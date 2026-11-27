# Utility functions
from jsonc_parser.parser import JsoncParser
import re
import os
import pathlib
from svgelements import Color, Point
from toolchain import REPO_ROOT

NODES_AND_PATHS = JsoncParser.parse_file("nodes.jsonc")

# the symbol database of CircuiTikZ-Designer
OUTPUT_FILE = REPO_ROOT / "src" / "data" / "symbols.svg"


# Generates a component name based on the index, id, and options.
# Example: component_name_from_info(1, "id", True, ["option1", "option2"]) -> "node_001_id_option1-option2"
#          component_name_from_info(2, "id", False, ["option1"]) -> "path_002_id_option1"
def component_name_from_info(index: int, id: str, isnode=True, options=[]):
	basename_array = ["node" if isnode else "path"]
	if index is not None:
		basename_array.append(f"{index:03d}")
	basename_array.append(id)
	if len(options) > 0:
		basename_array.append("_".join(options))
	basename_array = [re.sub(r"\W", "-", part) for part in basename_array]  # Remove spaces from each part
	return "_".join(basename_array)


# Names the component of a file in build/ and where it is defined, for error messages
def describe_component(filename):
	index, is_node = parse_filename(filename)
	section, name_key = ("nodes", "name") if is_node else ("path", "drawName")
	name = NODES_AND_PATHS[section][index][name_key]
	return f'{filename}: "{name}", defined in {section}[{index}] of nodes.jsonc'


# Parses a filename in the format "node_001_id_option1-option2" or "path_001_id_option1-option2"
# and returns a tuple of (index, is_node).
# Example: "node_001_id_option1-option2" -> (1, True)
#          "path_001_id_option1-option2" -> (1, False)
def parse_filename(filename):
	parts = filename.split("_")
	return int(parts[1]), (parts[0] == "node")


def index_to_color(index) -> Color:
	# Convert index to a color in RGB format. the index is expected to be in [0, 63]. r = 4*index, g = 153, b = 153.
	r = index << 2
	return Color(f"rgb({r},{0x99},{0x99})")


# Converts a color in RGB format to an index. r = 4*index, g = 153, b = 153.
# The color is expected to be in the format (r, 153, 153) where r is in [0, 252].
# Example: (0, 153, 153) -> 0
#          (252, 153, 153) -> 63
# Raises ValueError if the color format is invalid.
def color_to_index(color: Color):
	if color.red & 0x3 != 0 or color.green != 0x99 or color.blue != 0x99:
		raise ValueError("Invalid color format. Expected RGB with r in [0, 252], g=153, b=153.")
	return color.red >> 2


def filter_newer(files: list[str], target_file_extension: str):
	paths = [pathlib.Path(f) for f in files]
	target_file_extension = target_file_extension.lstrip(".")
	return [p for p in paths if not os.path.isfile(p.parent / f"{p.stem}.{target_file_extension}")]


def options_object_to_array(
	options,
) -> list[list[dict]]:
	if not isinstance(options, list) or len(options) == 0:
		return [[]]

	current_option = options[0]
	converted_options = options_object_to_array(options[1:])

	result = []

	if "enumOptions" in current_option:
		for option in current_option["enumOptions"]:
			for converted_option in converted_options:
				optionsArray = [option]
				optionsArray.extend(converted_option)
				result.append(optionsArray)

		if "selectNone" not in current_option or current_option["selectNone"]:
			for converted_option in converted_options:
				result.append(converted_option)
	else:
		for convertedOption in converted_options:
			options_array = [current_option]
			options_array.extend(convertedOption)
			result.append(options_array)
			result.append(convertedOption)

	return result


def are_two_points_close(pointA: Point, pointB: Point, eps=1e-6):
	return (
		(pointA.x >= pointB.x - eps)
		and (pointA.x <= pointB.x + eps)
		and (pointA.y >= pointB.y - eps)
		and (pointA.y <= pointB.y + eps)
	)
