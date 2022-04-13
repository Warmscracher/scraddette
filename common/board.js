/** @file Code To perform operations related to the potatoboard. */
import { MessageActionRow, MessageButton, MessageEmbed } from "discord.js";
import extractMessageExtremities from "../lib/extractMessageExtremities.js";
import { Embed } from "@discordjs/builders";

import getAllMessages from "../lib/getAllMessages.js";
import messageToText from "../lib/messageToText.js";

export const BOARD_CHANNEL = process.env.BOARD_CHANNEL ?? "";
export const BOARD_EMOJI = "🥔";
export const MIN_REACTIONS = process.env.NODE_ENV === "production" ? 6 : 1;

/**
 * Supplied a message in #potatoboard, get the original message that was reacted to.
 *
 * @param {import("discord.js").Message} boardMessage - Message in #potatoboard.
 *
 * @returns {Promise<import("discord.js").Message<boolean> | undefined>} - Source message.
 */
export async function boardMessageToSource(boardMessage) {
	const component = boardMessage?.components[0]?.components?.[0];

	if (component?.type !== "BUTTON") return;

	const { guildId, channelId, messageId } =
		/^https?:\/\/(?:.+\.)?discord\.com\/channels\/(?<guildId>\d+|@me)\/(?<channelId>\d+)\/(?<messageId>\d+)\/?$/iu.exec(
			component.url ?? "",
		)?.groups ?? {};

	if (boardMessage.guild?.id !== guildId || !channelId || !messageId) return;

	const channel = await boardMessage.guild?.channels.fetch(channelId).catch(() => {});

	if (!channel?.isText()) return;

	const message = await channel.messages.fetch(messageId);

	if (!message) return;

	return message;
}

/** @type {import("discord.js").Message[] | undefined} */
let MESSAGES;

/**
 * Supplied a message, get the message in #potatoboard that references it.
 *
 * @param {import("discord.js").Message} message - Message to find.
 *
 * @returns {Promise<import("discord.js").Message<boolean> | undefined>} Message on #potatoboard.
 */
export async function sourceToBoardMessage(message) {
	if (!message.guild) return;

	const board = await message.guild.channels.fetch(BOARD_CHANNEL);

	if (!board?.isText()) {
		throw new ReferenceError("Could not find board channel.");
	}

	MESSAGES ??= await getAllMessages(board);

	return MESSAGES.find((boardMessage) => {
		const component = boardMessage?.components[0]?.components?.[0];

		if (component?.type !== "BUTTON") return false;

		const messageId = /\d+$/.exec(component.url ?? "")?.[0];

		return messageId === message.id;
	});
}

/**
 * Add a message to the #potatoboard.
 *
 * @param {import("discord.js").Message} message - Message to add.
 */
export async function postMessageToBoard(message) {
	if (!message.guild) throw new TypeError("Cannot post DMs to potatoboard");

	const { files, embeds } = await extractMessageExtremities(message);

	const board = await message.guild?.channels.fetch(BOARD_CHANNEL);

	if (!board?.isText()) {
		throw new ReferenceError("Could not find board channel.");
	}

	const description = await messageToText(message);

	const boardEmbed = new Embed()
		.setColor(message.member?.displayColor ?? 0)
		.setDescription(description??null)
		.setAuthor({
			iconURL: message.member?.displayAvatarURL() ?? message.author.displayAvatarURL(),

			name: message.member?.displayName ?? message.author.username,
		})
		.setTimestamp(message.createdTimestamp);

	const button = new MessageButton()
		.setEmoji("👀")
		.setLabel("View Context")
		.setStyle("LINK")
		.setURL(
			`https://discord.com/channels/${message.guild?.id ?? "@me"}/${message.channel.id}/${
				message.id
			}`,
		);
	const reaction = message.reactions.resolve(BOARD_EMOJI);

	if (!reaction) return;

	const boardMessage = await board.send({
		allowedMentions: process.env.NODE_ENV === "production" ? undefined : { users: [] },
		components: [new MessageActionRow().addComponents(button)],

		content: `**${BOARD_EMOJI} ${(reaction?.count ?? 0) - (reaction.me ? 1 : 0)}** | ${
			message.channel.type === "DM"
				? ""
				: `${message.channel.toString()}${
						message.channel.isThread()
							? ` (${message.channel.parent?.toString() ?? ""})`
							: ""
				  }`
		} | ${(message.member ?? message.author).toString()}`,
		embeds: [boardEmbed, ...embeds],
		files,
	});
	MESSAGES ??= await getAllMessages(board);
	MESSAGES.push(boardMessage);
	return boardMessage;
}

/**
 * Update the count on a message on #potatoboard.
 *
 * @param {number} count - The updated count.
 * @param {import("discord.js").Message} boardMessage - The message to update.
 */
export async function updateReactionCount(count, boardMessage) {
	MESSAGES ??= await getAllMessages(boardMessage.channel);

	if (count < Math.max(MIN_REACTIONS - 1, 1)) {
		MESSAGES = MESSAGES.filter(({ id }) => id !== boardMessage.id);
		await boardMessage.delete();
	} else {
		const newMessage = await boardMessage.edit({
			allowedMentions: process.env.NODE_ENV === "production" ? undefined : { users: [] },
			content: boardMessage.content.replace(/\d+/, `${count}`),
			embeds: boardMessage.embeds.map((oldEmbed) => new MessageEmbed(oldEmbed)),
			files: boardMessage.attachments.map((attachment) => attachment),
		});
		MESSAGES = MESSAGES.map((msg) => (msg.id === newMessage.id ? newMessage : msg));
	}
}
