/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/*
 * Replaces '<pkg>/ui/content' with the new bundle from './dist'. Either call throws, and fails the build, on error.
 */

const fs = require("fs");
const DIST_ASSETS_PATH = "./dist";
const UI_CONTENTS_PATH = "../ui/content";

fs.rmSync(UI_CONTENTS_PATH, { recursive: true, force: true });
fs.cpSync(DIST_ASSETS_PATH, UI_CONTENTS_PATH, { recursive: true });
