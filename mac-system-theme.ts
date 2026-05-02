/**
 * Syncs pi theme with system appearance (dark/light mode).
 *
 * On macOS, reads the system appearance. On other platforms, uses DARK_MODE=1
 * for dark mode and DARK_MODE=0 for light mode.
 *
 * Usage:
 *   pi -e examples/extensions/mac-system-theme.ts
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const execAsync = promisify(exec);

type ThemeName = "dark" | "light";

async function getSystemTheme(): Promise<ThemeName> {
	if (process.platform !== "darwin") {
		return process.env.DARK_MODE === "1" ? "dark" : "light";
	}

	try {
		const { stdout } = await execAsync("defaults read -g AppleInterfaceStyle");
		return stdout.trim() === "Dark" ? "dark" : "light";
	} catch {
		return "light";
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setTheme(await getSystemTheme());
	});
}
