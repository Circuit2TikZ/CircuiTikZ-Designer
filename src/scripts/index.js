/**
 * The main source file. Does only include {@link MainController}, which does the actual work.
 * @file index.js
 */

import {MainController} from "./internal";

window.mainController = MainController.instance;
