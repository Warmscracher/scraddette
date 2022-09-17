import { Message, AttachmentBuilder, Snowflake } from "discord.js";
import papaparse from "papaparse";
import fetch from "node-fetch";
import exitHook from "async-exit-hook";
import { getLoggingThread } from "./moderation/logging.js";
import client from "../client.js";
import type { RECORDS } from "./records.js";
import type { NumberSmallerThan } from "../lib/numbers.js";

export const DATABASE_THREAD = "databases";

const thread = await getLoggingThread(DATABASE_THREAD);

const databases: Record<string, undefined | Message<true>> = {};

for (const message of (await thread.messages.fetch({ limit: 100 })).toJSON()) {
	const name = message.content.split(" ")[1]?.toLowerCase();
	if (name && message.author.id === client.user?.id) {
		databases[name] = message;
	}
}

let timeouts: Record<
	Snowflake,
	{ callback: () => Promise<Message<true>>; timeout: NodeJS.Timeout } | undefined
> = {};

const contructed: (keyof Databases)[] = [];

export default class Database<Name extends keyof Databases> {
	name: Name;
	message: Message<true> | undefined;
	#data: Databases[Name][] | undefined;
	#extra: string | undefined;
	constructor(name: Name) {
		if (contructed.includes(name))
			throw new RangeError(
				`Cannot create a 2nd database for ${name}, they will have conflicting data`,
			);
		contructed.push(name);
		this.name = name;
	}

	async init() {
		this.message = databases[this.name] ||= await thread.send(
			`**__SCRADD ${this.name.toUpperCase()} DATABASES__**\n\n*Please don’t delete this message. If you do, all ${this.name.replaceAll(
				"_",
				" ",
			)} may be reset.*`,
		);

		const attachment = this.message?.attachments.first()?.url;

		this.#data = attachment
			? await fetch(attachment)
					.then((res) => res.text())
					.then(
						(csv) =>
							papaparse.parse<Databases[Name]>(csv.trim(), {
								dynamicTyping: true,
								header: true,
							}).data,
					)
			: this.name === "records"
			? ([
					{ record: 0, count: 3395539621, users: "913260298155204619" },
					{ record: 1, count: 1, users: "771422735486156811" },
					{ record: 2, count: 500, users: "771422735486156811" },
					{ record: 3, count: 4, users: "765910070222913556" },
					{ record: 4, count: 172800000, users: "1015260570473214014" },
					{ record: 5, count: 10, users: "559426966151757824" },
					{ record: 6, count: 5, users: "771422735486156811" },
					{ record: 7, count: 600000, users: "771422735486156811" },
					{ record: 8, count: 50, users: "771422735486156811" },
					{ record: 9, count: 3, users: "771422735486156811" },
					{ record: 10, count: 7, users: "771422735486156811" },
			  ] as Databases[Name][])
			: [];

		this.#extra = this.message.content.split("\n")[5];
	}

	get data() {
		if (!this.#data) throw new ReferenceError("Must call `.init()` before reading `.data`");
		return this.#data;
	}

	set data(content) {
		if (!this.message) throw new ReferenceError("Must call `.init()` before setting `.data`");
		this.#data = content;
		this.#queueWrite();
	}

	get extra() {
		if (!this.#data) throw new ReferenceError("Must call `.init()` before reading `.extra`");
		return this.#extra;
	}
	set extra(content) {
		if (!this.message) throw new ReferenceError("Must call `.init()` before setting `.extra`");
		this.#extra = content;
		this.#queueWrite();
	}

	#queueWrite() {
		if (!this.message)
			throw new ReferenceError(
				"Must call `.init()` before reading or setting `.data` or `.extra`",
			);

		const timeoutId = timeouts[this.message.id];

		const callback = (): Promise<Message<true>> => {
			if (!this.message)
				throw new ReferenceError(
					"Must call `.init()` before reading or setting `.data` or `.extra`",
				);

			const files = this.#data?.length
				? [
						new AttachmentBuilder(Buffer.from(papaparse.unparse(this.#data), "utf-8"), {
							name: this.name + ".csv",
						}),
				  ]
				: [];
			const messageContent = this.message.content.split("\n");
			messageContent[3] = "";
			if (this.#extra) {
				messageContent[4] = "Extra misc info:";
				messageContent[5] = this.#extra;
			} else {
				messageContent[4] = "";
				messageContent[5] = "";
			}

			const promise = this.message
				.edit({ content: messageContent.join("\n").trim(), files })
				.catch(async () => {
					databases[this.name] = undefined;
					await this.init();
					return callback();
				});

			timeouts[this.message.id] = undefined;
			return promise;
		};

		timeouts[this.message.id] = { timeout: setTimeout(callback, 15_000), callback };
		timeoutId && clearTimeout(timeoutId.timeout);
	}
}

export function cleanDatabaseListeners() {
	console.log(`Cleaning ${Object.values(timeouts).length} listeners: ${Object.keys(timeouts)}`);
	return Promise.all(Object.values(timeouts).map((info) => info?.callback())).then(
		() => (timeouts = {}) && console.log("Listeners cleaned"),
	);
}

exitHook((callback) => cleanDatabaseListeners().then(callback));

export type Databases = {
	board: {
		/** The number of reactions this message has. */
		reactions: number;
		/** The ID of the user who posted this. */
		user: Snowflake;
		/** The ID of the channel this message is in. */
		channel: Snowflake;
		/** The ID of the message on the board. */
		onBoard?: Snowflake;
		/** The ID of the original message. */
		source: Snowflake;
	};
	warn: {
		/** The ID of the user who was warned. */
		user: Snowflake;
		/** The time when this warn expires. */
		expiresAt: number;
		/** The ID of the message in #mod-log with more information. */
		info: Snowflake;
	};
	mute: {
		/** The ID of the user who was muted. */
		user: Snowflake;
		/** The time when this mute is no longer taken into account when calculating future mute times. */
		expiresAt: number;
	};
	xp: {
		/** The ID of the user. */
		user: Snowflake;
		/** How much XP they have. */
		xp: number;
	};
	user_settings: {
		/** The ID of the user. */
		user: Snowflake;
		/** Whether to ping the user when their message gets on the board. */
		boardPings: boolean;
		/** Whether to ping the user when they level up. */
		levelUpPings: boolean;
		/** Whether to ping the user when they are a top poster of the week. */
		weeklyPings: boolean;
		/** Whether to automatically react to their messages with random emojis. */
		autoreactions: boolean;
	};
	recent_xp: {
		/** The ID of the user. */
		user: Snowflake;
		/** How much XP they gained. */
		xp: number;
		/** The time when they gained it at. */
		time: number;
	};
	records: {
		record: NumberSmallerThan<typeof RECORDS.length>;
		users: string;
		count: number;
		time: number;
	};
	vc_users: { user: Snowflake; time: number; channel: Snowflake };
	messages: { author: Snowflake; time: number };
	joins: { user: Snowflake; time: number };
	chain: { channel: Snowflake; count: number; users: string };
};
