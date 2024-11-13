/**
 * The electron main source file.
 * @file main.js
 */

const { app, BrowserWindow } = require("electron")
const path = require("path")
const url = require("url")
const pkg = require("../../package.json")
const started = require("electron-squirrel-startup")
let win

if (started) app.quit()

function createWindow() {
	win = new BrowserWindow({
		autoHideMenuBar: true,
		maximizable: true,
		backgroundColor: "lightgray",
		// title: config.productName,
		show: true,
		webPreferences: {
			nodeIntegration: true,
			defaultEncoding: "UTF-8",
			worldSafeExecuteJavaScript: true,
			enableRemoteModule: true,
		},
	})
	if (pkg.devMode) win.loadURL("http://localhost:1234/")
	else
		win.loadURL(
			url.format({
				pathname: path.join(__dirname, "../../dist/index.html"),
				protocol: "file:",
				slashes: true,
			})
		)
	// win.webContents.openDevTools();
	win.on("closed", () => {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		win = null
	})
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow)

app.on("window-all-closed", () => {
	// On macOS it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== "darwin") {
		app.quit()
	}
})
app.on("activate", () => {
	// On macOS it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (win === null) {
		createWindow()
	}
})
