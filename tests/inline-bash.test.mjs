import assert from "node:assert/strict";
import test from "node:test";
import inlineBash from "../inline-bash.ts";

function setup(...results) {
	let input;
	const calls = [];
	const notifications = [];
	inlineBash({
		on(event, handler) {
			assert.equal(event, "input");
			input = handler;
		},
		async exec(program, args, options) {
			assert.equal(program, "bash");
			assert.equal(args[0], "-c");
			assert.deepEqual(options, { timeout: 30000 });
			calls.push(args[1]);
			const result = results.shift();
			if (result instanceof Error) throw result;
			return typeof result === "string"
				? { stdout: result, stderr: "", code: 0 }
				: result;
		},
	});
	return {
		calls,
		notifications,
		run(text, { images, hasUI = false } = {}) {
			return input({ text, images }, {
				hasUI,
				ui: { notify: (...args) => notifications.push(args) },
			});
		},
	};
}

test("inserts output literally, including replacement tokens", async () => {
	const literal = "$& $$ $` $'";
	const { run, calls } = setup(" " + literal + "\n");
	assert.equal((await run("😀 before !{demo} after")).text, "😀 before " + literal + " after");
	assert.deepEqual(calls, ["demo"]);
});

test("only expands original snippets, including repeated and adjacent ones", async () => {
	const { run, calls } = setup("literal !{two}", "TWO", "again", "");
	assert.equal(
		(await run("A !{one} B !{two}!{one}!{empty} C")).text,
		"A literal !{two} B TWOagain C",
	);
	assert.deepEqual(calls, ["one", "two", "one", "empty"]);
});

test("keeps errors literal and preserves exit status notices and images", async () => {
	const { run, calls, notifications } = setup(
		new Error("failed $& !{next}"),
		{ stdout: "", stderr: "stderr\n", code: 3 },
	);
	const images = [];
	const output = await run("!{oops} / !{next}", { images, hasUI: true });
	assert.equal(output.action, "transform");
	assert.equal(output.text, "[error: failed $& !{next}] / stderr");
	assert.equal(output.images, images);
	assert.deepEqual(calls, ["oops", "next"]);
	assert.deepEqual(notifications, [[
		'Expanded 2 inline command(s):\n!{oops} (failed $& !{next}) -> ""\n!{next} (exit code 3) -> "stderr"',
		"info",
	]]);
});

test("leaves plain text and whole-line Bash commands alone", async () => {
	const { run, calls, notifications } = setup("OK", "Still OK");
	for (const text of ["plain prompt", "  !echo !{skip}"]) {
		assert.deepEqual(await run(text), { action: "continue" });
	}
	assert.equal((await run("!{first}")).text, "OK");
	assert.equal((await run("!{second}")).text, "Still OK");
	assert.deepEqual(calls, ["first", "second"]);
	assert.deepEqual(notifications, []);
});
