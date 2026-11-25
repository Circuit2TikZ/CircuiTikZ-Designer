const { FusesPlugin } = require("@electron-forge/plugin-fuses")
const { FuseV1Options, FuseVersion } = require("@electron/fuses")
const { version } = require("./package.json")

// The web app has to be built (npm run build) before packaging, it is loaded from dist/.
// Only what the desktop app needs goes into the package, not the whole source tree. The
// dependencies of the web app are already bundled in dist/, main.js only requires
// electron-squirrel-startup (which brings its own dependencies in its node_modules).
const include = ["/package.json", "/src/scripts/main.js", "/dist", "/node_modules/electron-squirrel-startup"]

const linuxOptions = {
	name: "circuitikz-designer",
	// the makers look for an executable named like package.json's name by default,
	// keep it explicit so it can't get out of sync with packagerConfig.executableName
	bin: "circuitikz-designer",
	productName: "CircuiTikZ Designer",
	genericName: "Circuit diagram editor",
	categories: ["Graphics", "Education"],
	icon: "./src/icons/android-icon-512x512.png",
}

module.exports = {
	packagerConfig: {
		name: "CircuiTikZ-Designer",
		executableName: "circuitikz-designer",
		appBundleId: "io.github.circuit2tikz.circuitikz-designer",
		// without file extension, the right format (.ico / .icns) is picked per platform
		icon: "./src/icons/app",
		// shown in the Windows file properties and the task manager (defaults to the name above)
		win32metadata: {
			ProductName: "CircuiTikZ Designer",
			FileDescription: "CircuiTikZ Designer",
		},
		asar: true,
		ignore: (file) => {
			if (!file || file === "/") return false
			// the source maps are only left out of the package: the build has to create them,
			// scripts/generateNotices.mjs reads the bundled packages from them
			if (file.startsWith("/dist/") && file.endsWith(".map")) return true
			return !include.some((p) => file === p || file.startsWith(p + "/") || p.startsWith(file + "/"))
		},
	},
	rebuildConfig: {},
	makers: [
		// all platforms
		{ name: "@electron-forge/maker-zip", config: {} },
		// Windows installer
		{
			name: "@electron-forge/maker-squirrel",
			config: {
				name: "CircuiTikZDesigner",
				setupIcon: "./src/icons/app.ico",
				setupExe: `circuitikz-designer-${version}-win-x64-setup.exe`,
			},
		},
		// Debian, Ubuntu and derivatives
		{ name: "@electron-forge/maker-deb", config: { options: linuxOptions } },
		// Fedora, RHEL, openSUSE and derivatives
		{ name: "@electron-forge/maker-rpm", config: { options: linuxOptions } },
	],
	plugins: [
		{
			name: "@electron-forge/plugin-auto-unpack-natives",
			config: {},
		},
		// Fuses are used to enable/disable various Electron functionality
		// at package time, before code signing the application
		new FusesPlugin({
			version: FuseVersion.V1,
			[FuseV1Options.RunAsNode]: false,
			[FuseV1Options.EnableCookieEncryption]: true,
			[FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
			[FuseV1Options.EnableNodeCliInspectArguments]: false,
			[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
			[FuseV1Options.OnlyLoadAppFromAsar]: true,
		}),
	],
}
