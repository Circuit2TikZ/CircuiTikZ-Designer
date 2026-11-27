SVGO_BASE_CONFIG = {
	"multipass": True,
	"floatPrecision": 5,
	"js2svg": {
		"indent": "\t",
		"pretty": True,
		"eol": "lf",
		"finalNewline": True,
	},
	"plugins": [
		{
			"name": "preset-default",
			"params": {
				"overrides": {
					"convertPathData": {
						"forceAbsolutePath": True,
						"applyTransforms": True,
						"utilizeAbsolute": True,
					},
					"convertColors": {
						"shortname": False,
					},
					"removeUselessDefs": False,
				},
			},
		},
		{"name": "removeUselessStrokeAndFill", "params": {"stroke": True, "fill": True, "removeNone": True}},
		"removeDimensions",
		"removeHiddenElems",
		"moveGroupAttrsToElems",
		"cleanupAttrs",
		"collapseGroups",
		"convertStyleToAttrs",
	],
}

SVGO_CONFIG = {
	"multipass": True,
	"floatPrecision": 5,
	"js2svg": {
		"indent": "\t",
		"pretty": True,
		"eol": "lf",
		"finalNewline": True,
	},
	"plugins": [
		"removeDimensions",
		"removeViewBox",
		{"name": "cleanupIds", "params": {"force": False, "minify": False, "remove": False}},
		{
			"name": "convertPathData",
			"params": {
				"applyTransforms": True,
				"forceAbsolutePath": False,
				"utilizeAbsolute": False,
				"floatPrecision": 4,
				"removeUseless": True,
				"collapseRepeated": True,
			},
		},
		{"name": "mergePaths", "params": {"noSpaceAfterFlags": True}},
	],
}
