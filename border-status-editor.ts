import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
} from "@mariozechner/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

function fitBorder(
	left: string,
	right: string,
	width: number,
	border: (text: string) => string,
	fill: (text: string) => string = border,
): string {
	if (width <= 0) return "";
	if (width === 1) return border("─");

	let leftText = left;
	let rightText = right;
	const fixedWidth = 2;
	const minimumGap = 3;
	const maxContentWidth = Math.max(0, width - fixedWidth - minimumGap);
	let leftWidth = visibleWidth(leftText);
	let rightWidth = visibleWidth(rightText);

	if (leftWidth + rightWidth > maxContentWidth) {
		let overflow = leftWidth + rightWidth - maxContentWidth;
		if (rightWidth > 0) {
			rightText = truncateToWidth(
				rightText,
				Math.max(0, rightWidth - overflow),
				"",
			);
			rightWidth = visibleWidth(rightText);
		}

		overflow = leftWidth + rightWidth - maxContentWidth;
		if (overflow > 0 && leftWidth > 0) {
			leftText = truncateToWidth(
				leftText,
				Math.max(0, leftWidth - overflow),
				"",
			);
			leftWidth = visibleWidth(leftText);
		}
	}

	const gapWidth = Math.max(0, width - fixedWidth - leftWidth - rightWidth);
	return `${border("─")}${leftText}${fill("─".repeat(gapWidth))}${rightText}${border("─")}`;
}

function formatCwd(cwd: string): string {
	const home = process.env.HOME;
	if (home && cwd.startsWith(home)) {
		return `~${cwd.slice(home.length)}`;
	}
	return cwd;
}

function formatBattery(percent: number | undefined): string {
	const filled =
		percent === undefined
			? 0
			: percent >= 90
				? 5
				: percent >= 80
					? 4
					: percent >= 60
						? 3
						: percent >= 40
							? 2
							: percent >= 20
								? 1
								: 0;
	return `${"▰".repeat(filled)}${"▱".repeat(5 - filled)}`;
}

function formatContext(
	ctx: ExtensionContext,
	theme: {
		fg(color: "muted" | "error", text: string): string;
	},
): string {
	const usage = ctx.getContextUsage();
	const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;
	const windowText = contextWindow
		? `${(contextWindow / 1000).toFixed(0)}k`
		: "?";
	if (!usage || usage.percent === null) {
		return theme.fg("muted", `${formatBattery(undefined)} ?/${windowText}`);
	}

	const percent = Math.round(usage.percent);
	const battery = formatBattery(percent);
	const text = ` ${percent}%/${windowText}`;
	return percent >= 90
		? `${theme.fg("error", battery)}${theme.fg("muted", text)}`
		: theme.fg("muted", `${battery}${text}`);
}

function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

function formatExtensionStatuses(
	statuses?: ReadonlyMap<string, string>,
): string {
	if (!statuses || statuses.size === 0) return "";
	return Array.from(statuses.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, text]) => sanitizeStatusText(text))
		.filter(Boolean)
		.join(" · ");
}

function formatThinking(level: string): string {
	return level === "off" ? "off" : level;
}

type GitSummary = {
	changedFiles: number;
	additions: number;
	deletions: number;
};

function parseGitShortstat(
	output: string,
): Pick<GitSummary, "additions" | "deletions"> {
	const additions = Number.parseInt(
		output.match(/(\d+)\s+insertion/)?.[1] ?? "0",
		10,
	);
	const deletions = Number.parseInt(
		output.match(/(\d+)\s+deletion/)?.[1] ?? "0",
		10,
	);
	return { additions, deletions };
}

function formatGitSummary(
	summary: GitSummary | undefined,
	theme: {
		fg(color: "text" | "success" | "error", text: string): string;
	},
): string {
	if (!summary || summary.changedFiles === 0) return "";

	const parts = [theme.fg("text", `Δ ${summary.changedFiles}`)];
	if (summary.additions > 0)
		parts.push(theme.fg("success", `+${summary.additions}`));
	if (summary.deletions > 0)
		parts.push(theme.fg("error", `-${summary.deletions}`));
	return parts.join(" ");
}

class HiddenFooter implements Component {
	constructor(private readonly unsubscribe?: () => void) {}

	render(): string[] {
		return [];
	}

	invalidate(): void {}

	dispose(): void {
		this.unsubscribe?.();
	}
}

type FooterData = {
	getGitBranch(): string | null;
	getExtensionStatuses(): ReadonlyMap<string, string>;
	onBranchChange(callback: () => void): () => void;
};

const GIT_SUMMARY_TIMEOUT_MS = 2_000;
const SPINNER_INTERVAL_MS = 120;

function createGitSummaryRefresher(
	pi: ExtensionAPI,
	getFooterData: () => FooterData | undefined,
	requestRender: () => void,
) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inFlight = false;
	let refreshPending = false;
	let notGitRepo = false;
	let generation = 0;
	let activeGeneration: number | undefined;
	let summary: GitSummary | undefined;

	const clearTimer = () => {
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}
	};

	const isActive = (token: number) => activeGeneration === token;

	const schedule = (cwd: string | undefined, delayMs = 750) => {
		if (activeGeneration === undefined || !cwd || notGitRepo) return;
		clearTimer();
		const token = activeGeneration;
		timer = setTimeout(() => {
			timer = undefined;
			void refresh(cwd, token);
		}, delayMs);
	};

	const refresh = async (cwd: string, token: number) => {
		if (!isActive(token) || notGitRepo) return;
		if (getFooterData()?.getGitBranch() === null) {
			notGitRepo = true;
			summary = undefined;
			requestRender();
			return;
		}
		if (inFlight) {
			refreshPending = true;
			return;
		}

		inFlight = true;
		try {
			const status = await pi
				.exec("git", ["--no-optional-locks", "status", "--porcelain=v1"], {
					cwd,
					timeout: GIT_SUMMARY_TIMEOUT_MS,
				})
				.catch(() => undefined);
			if (!isActive(token)) return;
			if (!status || status.code !== 0) {
				if (!status?.killed) notGitRepo = true;
				summary = undefined;
				return;
			}

			const statusLines = status.stdout
				.split(/\r?\n/)
				.map((line) => line.trimEnd())
				.filter(Boolean);

			if (statusLines.length === 0) {
				summary = undefined;
				return;
			}

			const shortstat = await pi
				.exec(
					"git",
					["--no-optional-locks", "diff", "--shortstat", "HEAD", "--"],
					{ cwd, timeout: GIT_SUMMARY_TIMEOUT_MS },
				)
				.catch(() => undefined);
			if (!isActive(token)) return;

			const stats = parseGitShortstat(shortstat?.stdout ?? "");
			summary = {
				changedFiles: statusLines.length,
				additions: stats.additions,
				deletions: stats.deletions,
			};
		} finally {
			inFlight = false;
			if (isActive(token)) requestRender();
			if (refreshPending && activeGeneration !== undefined) {
				refreshPending = false;
				schedule(cwd, 250);
			}
		}
	};

	return {
		getSummary: () => summary,
		start() {
			activeGeneration = ++generation;
			notGitRepo = false;
			summary = undefined;
			refreshPending = false;
		},
		stop() {
			activeGeneration = undefined;
			generation++;
			clearTimer();
			summary = undefined;
			refreshPending = false;
		},
		schedule,
	};
}

export default function (pi: ExtensionAPI) {
	let isWorking = false;
	let spinnerIndex = 0;
	let spinnerTimer: ReturnType<typeof setInterval> | undefined;
	let activeTui: TUI | undefined;
	let footerDataRef: FooterData | undefined;
	let cwdDisplay = "";
	const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	const gitSummaryRefresher = createGitSummaryRefresher(
		pi,
		() => footerDataRef,
		() => activeTui?.requestRender(),
	);

	const stopSpinner = () => {
		if (spinnerTimer) {
			clearInterval(spinnerTimer);
			spinnerTimer = undefined;
		}
	};

	pi.on("agent_start", () => {
		isWorking = true;
		stopSpinner();
		spinnerTimer = setInterval(() => {
			spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
			activeTui?.requestRender();
		}, SPINNER_INTERVAL_MS);
		activeTui?.requestRender();
	});

	pi.on("agent_end", () => {
		isWorking = false;
		stopSpinner();
		activeTui?.requestRender();
	});

	pi.on("tool_result", (event, ctx) => {
		const toolName = (event as { toolName?: string }).toolName;
		if (toolName === "edit" || toolName === "write" || toolName === "bash") {
			gitSummaryRefresher.schedule(ctx.cwd);
		}
	});

	pi.on("turn_end", (_event, ctx) => {
		gitSummaryRefresher.schedule(ctx.cwd, 250);
	});

	pi.on("session_shutdown", () => {
		stopSpinner();
		gitSummaryRefresher.stop();
		activeTui = undefined;
		footerDataRef = undefined;
		cwdDisplay = "";
	});

	pi.on("session_start", (_event, ctx) => {
		gitSummaryRefresher.start();
		cwdDisplay = formatCwd(ctx.cwd);
		ctx.ui.setWorkingVisible(false);
		ctx.ui.setFooter((tui, _theme, footerData) => {
			footerDataRef = footerData;
			return new HiddenFooter(
				footerData.onBranchChange(() => {
					gitSummaryRefresher.schedule(ctx.cwd, 0);
					tui.requestRender();
				}),
			);
		});
		gitSummaryRefresher.schedule(ctx.cwd, 0);

		class BorderStatusEditor extends CustomEditor {
			constructor(
				tui: TUI,
				theme: EditorTheme,
				keybindings: KeybindingsManager,
			) {
				super(tui, theme, keybindings, { paddingX: 0 });
				activeTui = tui;
			}

			render(width: number): string[] {
				const lines = super.render(width);
				if (lines.length < 2) return lines;

				const thm = ctx.ui.theme;
				const model = ctx.model
					? `${ctx.model.provider}/${ctx.model.id}`
					: "no model";
				const thinking = pi.getThinkingLevel();
				const branch = footerDataRef?.getGitBranch();
				const cwdInfo = `${thm.fg("text", ` ${cwdDisplay}`)}${branch ? thm.fg("warning", ` (${branch})`) : ""}${thm.fg("text", " ")}`;
				const spinner = isWorking
					? thm.fg("accent", `${spinnerFrames[spinnerIndex]} `)
					: "";
				const topLeft = `${cwdInfo}${isWorking ? thm.fg("muted", "· ") + spinner : ""}`;
				const gitSummaryText = formatGitSummary(
					gitSummaryRefresher.getSummary(),
					thm,
				);
				const contextText = formatContext(ctx, thm);
				const topRight = gitSummaryText
					? ` ${gitSummaryText}${thm.fg("muted", " · ")}${contextText} `
					: ` ${contextText} `;
				const footerStatuses = formatExtensionStatuses(
					footerDataRef?.getExtensionStatuses(),
				);
				const bottomLeft = footerStatuses ? ` ${footerStatuses} ` : "";
				const bottomRight = thm.fg(
					"muted",
					` ${model} · ${formatThinking(thinking)} `,
				);
				const borderColor = (text: string) => this.borderColor(text);

				lines[0] = fitBorder(topLeft, topRight, width, borderColor);
				lines[lines.length - 1] = fitBorder(
					bottomLeft,
					bottomRight,
					width,
					borderColor,
				);

				const paddingLine = " ".repeat(Math.max(0, width));
				lines.splice(1, 0, paddingLine);
				lines.splice(lines.length - 1, 0, paddingLine);
				return lines;
			}
		}

		ctx.ui.setEditorComponent(
			(tui, theme, keybindings) =>
				new BorderStatusEditor(tui, theme, keybindings),
		);
	});
}
