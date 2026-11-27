from tqdm.contrib.concurrent import thread_map
import functools
import glob
import os
import pathlib
import subprocess
from utils import (
	NODES_AND_PATHS,
	component_name_from_info,
	filter_newer,
	find_tool,
	index_to_color,
	options_object_to_array,
)


def _compile_worker(path: pathlib.Path, lualatex: str):
	"""
	Worker function to compile a single .tex file to .dvi.
	"""
	command = [
		lualatex,
		"-halt-on-error",
		"-output-format=dvi",
		"-interaction=nonstopmode",
		f"-jobname={path.stem}",
		path.absolute(),
	]
	p = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=path.parent)
	out, err = p.communicate()

	# remove auxiliary files
	# don't list the directory here: on some filesystems (observed with ntfs3) a listing can contain
	# the same file several times while other workers create and delete files
	for extension in [".aux", ".log", ".tmp", ".toc"]:
		path.with_suffix(extension).unlink(missing_ok=True)
	if p.returncode != 0:
		print(f"Error compiling {path.stem}:")
		print(out.decode())
		print(err.decode())
	return p.returncode


def compile_tex_files():
	lualatex = find_tool("lualatex")
	all_files = glob.glob("build/*.tex")
	all_files = filter_newer(all_files, ".dvi")

	results = thread_map(
		functools.partial(_compile_worker, lualatex=lualatex),
		all_files,
		desc="Compiling .tex files",
		unit="file",
		smoothing=0.1,
	)
	error_rs = [r for r in results if r != 0]
	if len(error_rs) > 0:
		raise RuntimeError(f"A total of {len(error_rs)} errors occurred during compilation")
	print("Sucessfully compiled all .tex files!")


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
	for index, path in enumerate(NODES_AND_PATHS["path"]):
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
