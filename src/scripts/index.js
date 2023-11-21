/**
 * The main source file. Does only include {@link MainController}, which does the actual work.
 * @file index.js
 */

import MainController from "./controllers/mainController.js";

window.mainController = new MainController();
