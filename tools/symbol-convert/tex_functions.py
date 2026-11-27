from tqdm.contrib.concurrent import thread_map
import functools
import glob
import itertools
import os
import pathlib
import subprocess
import traceback
from errors import Failure, raise_failures
from toolchain import find_tool, tex_environment
from utils import (
	NODES_AND_PATHS,
	component_name_from_info,
	describe_component,
	filter_newer,
	index_to_color,
	options_object_to_array,
)


def _tex_error_excerpt(log: str) -> str:
	"""
	The first error of a TeX log with the lines which follow it.
	"""
	lines = [line for line in log.splitlines() if line.strip()]
	start = next((i for i, line in enumerate(lines) if line.startswith("!")), None)
	if start is None:
		return "\n".join(lines[-10:])
	# the memory statistics after an error are of no interest
	excerpt = itertools.takewhile(lambda line: not line.startswith("Here is how much"), lines[start : start + 8])
	return "\n".join(excerpt)


def _compile_worker(path: pathlib.Path, lualatex: str, environment: dict[str, str]) -> Failure | None:
	"""
	Worker function to compile a single .tex file to .dvi. Returns the failure, if there is one.
	"""
	command = [
		lualatex,
		"-halt-on-error",
		"-output-format=dvi",
		"-interaction=nonstopmode",
		f"-jobname={path.stem}",
		path.absolute(),
	]
	try:
		p = subprocess.run(command, capture_output=True, cwd=path.parent, env=environment, check=False)
	except Exception as error:
		return Failure(describe_component(path.stem), f"lualatex could not be run: {error}", traceback.format_exc())

	# remove auxiliary files, the log is kept if the compilation failed
	# don't list the directory here: on some filesystems (observed with ntfs3) a listing can contain
	# the same file several times while other workers create and delete files
	extensions = [".aux", ".tmp", ".toc", *([".log"] if p.returncode == 0 else [])]
	for extension in extensions:
		path.with_suffix(extension).unlink(missing_ok=True)
	if p.returncode == 0:
		return None

	log_file = path.with_suffix(".log")
	log = log_file.read_text(errors="replace") if log_file.is_file() else (p.stdout + p.stderr).decode(errors="replace")
	return Failure(
		describe_component(path.stem),
		f"{_tex_error_excerpt(log)}\nTeX source: {path.resolve()}\nTeX log: {log_file.resolve()}",
	)


def compile_tex_files():
	lualatex = find_tool("lualatex")
	all_files = glob.glob("build/*.tex")
	all_files = filter_newer(all_files, ".dvi")

	results = thread_map(
		functools.partial(_compile_worker, lualatex=lualatex, environment=tex_environment()),
		all_files,
		desc="Compiling .tex files",
		unit="file",
		smoothing=0.1,
	)
	failures = [r for r in results if r is not None]
	if failures:
		raise_failures("compiling with lualatex", failures, len(all_files), pathlib.Path("build/errors.log"))
	print("Successfully compiled all .tex files!")


def create_tex_files_from_json(output_dir="build"):
	"""
	Reads a JSON file and creates .tex files in the specified output directory.
	"""
	# Ensure the output directory exists
	os.makedirs(output_dir, exist_ok=True)

	# load node stencil
	with open("stencil_pgf_node.tex", "r") as f:
		node_stencil = f.read()

	# Iterate through each node in the JSON data
	for index, node in enumerate(NODES_AND_PATHS["nodes"]):
		fillable = node["fillable"] if "fillable" in node else False
		option_possibilities = options_object_to_array(node["options"] if "options" in node else [])
		for tmp, option_possibility in enumerate(option_possibilities):
			options = [option["name"] for option in option_possibility]
			options_display = [
				option["displayName"] if "displayName" in option else option["name"] for option in option_possibility
			]
			name_options = ", ".join([node["name"], *(options if len(options) > 0 else [])])
			basename = component_name_from_info(index, node["name"], True, options_display)

			addPins = []
			subPins = []
			for option in option_possibility:
				if "addPins" in option:
					addPins.extend(option["addPins"])
				if "subPins" in option:
					subPins.extend(option["subPins"])

			anchorLines = ""
			if "pins" in node and len(node["pins"]) > 0:
				anchors = [anchor for anchor in node["pins"] if anchor not in subPins and anchor != "center"]
				anchors.extend(addPins)
				for anchorIndex, anchor in enumerate(anchors):
					color = index_to_color(anchorIndex)
					color_str = f"rgb,255:red,{color.red};green,{color.green};blue,{color.blue}"
					anchorLines += f"\t\t\\draw[draw={{{color_str}}}] (0,0) -- (N.{anchor});\n"

			if fillable:
				name_options += ", fill=green"

			file_content = node_stencil.replace("<nodename>", name_options)
			file_content = file_content.replace("<anchorLines>", anchorLines)

			# Write the content to a .tex file
			with open(os.path.join(output_dir, f"{basename}.tex"), "w") as f:
				f.write(file_content)

	# load path stencil
	with open("stencil_pgf_path.tex", "r") as f:
		path_stencil = f.read()

	# Iterate through each path in the JSON data
	for index, path in enumerate(NODES_AND_PATHS["paths"]):
		fillable = path.get("fillable", False)
		option_possibilities = options_object_to_array(path["options"] if "options" in path else [])
		for tmp, option_possibility in enumerate(option_possibilities):
			options = [option["name"] for option in option_possibility]
			options_display = [
				option["displayName"] if "displayName" in option else option["name"] for option in option_possibility
			]
			shapeName = path["shapeName"] if "shapeName" in path else path["drawName"].replace(" ", "") + "shape"
			name_options = ", ".join(
				[shapeName, *(["circuitikz/" + option for option in options] if len(options) > 0 else [])]
			)
			basename = component_name_from_info(index, path["drawName"], False, options_display)

			addPins = []
			subPins = []
			for option in option_possibility:
				if "addPins" in option:
					addPins.extend(option["addPins"])
				if "subPins" in option:
					subPins.extend(option["subPins"])

			anchorLines = ""
			start = path["start"] if "start" in path else "b"
			end = path["end"] if "end" in path else "a"
			anchors = [
				anchor
				for anchor in ([start, end] + (path["pins"] if "pins" in path else []))
				if anchor not in subPins and anchor != "center"
			]
			anchors.extend(addPins)
			for anchorIndex, anchor in enumerate(anchors):
				color = index_to_color(anchorIndex)
				color_str = f"rgb,255:red,{color.red};green,{color.green};blue,{color.blue}"
				anchorLines += f"\t\t\\draw[draw={{{color_str}}}] (0,0) -- (P.{anchor});\n"

			if "stroke" in path and path["stroke"]:
				anchorLines += "\t\t\\draw (P.b) -- (P.a);\n"

			if fillable:
				name_options += ", color=black, fill=green"

			file_content = path_stencil.replace("<pathname>", name_options)
			file_content = file_content.replace("<anchorLines>", anchorLines)

			# Write the content to a .tex file
			with open(os.path.join(output_dir, f"{basename}.tex"), "w") as f:
				f.write(file_content)
