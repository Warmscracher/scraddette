import { Constants, GuildMember, Message, MessageEmbed, Util } from "discord.js";
import { Embed } from "@discordjs/builders";

import CONSTANTS from "./CONSTANTS.js";

/** @typedef {{ description: string; color: number; name: string }} Answer */

export const MAX_TITLE_LENGTH = 50;

export const RATELIMT_MESSAGE =
	"If the thread title does not update immediately, you may have been ratelimited. I will automatically change the title once the ratelimit is up (within the next hour).";

export const DEFAULT_COLOR = Constants.Colors.GREYPLE;

export const NO_SERVER_START =
	"In an effort to help SA developers find meaningful information, we have disabled server-related suggestions and bug reports. With this off, when a developer looks in ";

export default class SuggestionChannel {
	/**
	 * Initialize a suggestion channel.
	 *
	 * @param {string} CHANNEL_ID - The ID of the channel to use.
	 */
	constructor(CHANNEL_ID) {
		/** @type {string} */
		this.CHANNEL_ID = CHANNEL_ID;
	}

	/**
	 * Post a message in a suggestion channel.
	 *
	 * @param {import("discord.js").CommandInteraction} interaction - The interaction to reply to on errors.
	 * @param {{ title: string; description: string }} data - The suggestion information.
	 *
	 * @returns {Promise<false | import("discord.js").Message<boolean>>} - `false` on errors and the
	 *   suggestion message on success.
	 */
	async createMessage(interaction, data, defaultAnswer = "Unanswered") {
		const author = interaction.member;

		if (!(author instanceof GuildMember))
			throw new TypeError("interaction.member must be a GuildMember");

		const title = Util.escapeMarkdown(data.title);

		const embed = new Embed()
			.setColor(DEFAULT_COLOR)
			.setAuthor({
				iconURL: author.displayAvatarURL(),
				name: author?.displayName ?? interaction.user.username,
			})
			.setTitle(title)
			.setDescription(data.description)
			.setFooter({ text: `${defaultAnswer}` });

		const channel = await interaction.guild?.channels.fetch(this.CHANNEL_ID);

		if (!channel?.isText()) throw new ReferenceError(`Channel not found`);

		const message = await channel.send({ embeds: [embed] });
		const thread = await message.startThread({
			autoArchiveDuration: 1_440, // 24 hours
			name: `${title ?? ""} | ${defaultAnswer}`,
			reason: `Suggestion or bug report by ${interaction.user.tag}`,
		});

		await thread.members.add(interaction.user.id);

		return message;
	}

	/**
	 * Answer a suggestion.
	 *
	 * @param {import("discord.js").CommandInteraction} interaction - The interaction to reply to on errors.
	 * @param {string} answer - The answer to the suggestion.
	 * @param {Answer[]} answers - An object that maps answers to colors.
	 *
	 * @returns {Promise<boolean | "ratelimit">} - If true, you must respond to the interaction with
	 *   a success message yourself.
	 */
	async answerSuggestion(interaction, answer, answers) {
		if (
			!interaction.channel?.isThread() ||
			interaction.channel.parent?.id !== this.CHANNEL_ID
		) {
			await interaction.reply({
				content: `${CONSTANTS.emojis.statuses.no} This command can only be used in threads in <#${this.CHANNEL_ID}>.`,
				ephemeral: true,
			});

			return false;
		}

		const starter = await interaction.channel.fetchStarterMessage().catch(() => {});
		if (!(interaction.member instanceof GuildMember))
			throw new TypeError("interaction.member must be a GuildMember");

		if (!interaction.member?.roles.resolve(process.env.DEVELOPER_ROLE ?? "")) {
			await interaction.reply({
				content: `${CONSTANTS.emojis.statuses.no} You don’t have permission to run this command!`,
				ephemeral: true,
			});

			return false;
		}

		if (interaction.channel.archived) {
			await interaction.channel.setArchived(
				false,
				`Thread answered by ${interaction.user.tag}`,
			);
		}

		const promises = [
			Promise.race([
				new Promise((resolve) => setTimeout(resolve, 3_000)),
				interaction.channel.setName(
					interaction.channel.name.replace(/^(.+? \| )?[^|]+$/, "$1" + answer),
					`Thread answered by ${interaction.user.tag}`,
				),
			]),
		];

		if (starter && starter?.author.id === interaction.client.user?.id) {
			const embed = new MessageEmbed(starter.embeds[0]);

			embed
				.setColor(answers.find(({ name }) => answer === name)?.color ?? DEFAULT_COLOR)
				.setFooter({ text: answer });

			promises.push(starter.edit({ embeds: [embed] }));
		}

		await Promise.all(promises);

		return interaction.channel.name.startsWith(answer + " |") ? true : "ratelimit";
	}

	/**
	 * Edit a suggestion.
	 *
	 * @param {import("discord.js").CommandInteraction} interaction - Interaction to respond to on errors.
	 * @param {{ title: null | string; body: null | string }} updated - Updated suggestion.
	 *
	 * @returns {Promise<boolean | "ratelimit">} - If true, you must respond to the interaction with
	 *   a success message yourself.
	 */
	async editSuggestion(interaction, updated) {
		if (
			!interaction.channel?.isThread() ||
			interaction.channel.parent?.id !== this.CHANNEL_ID
		) {
			await interaction.reply({
				content: `${CONSTANTS.emojis.statuses.no} This command may only be used in threads in <#${this.CHANNEL_ID}>.`,
				ephemeral: true,
			});

			return false;
		}
		if (interaction.channel.archived)
			await interaction.channel.setArchived(false, "Thread edited");
		const starterMessage = await interaction.channel.fetchStarterMessage().catch(() => {});

		if (!starterMessage || starterMessage.author.id !== interaction.client.user?.id) {
			await interaction.reply({
				// TODO: it doesn’t have to be a suggestion here
				content: `${CONSTANTS.emojis.statuses.no} This suggestion can not be edited.`,
				ephemeral: true,
			});

			return false;
		}
		const user = await getUserFromSuggestion(starterMessage);

		if (interaction.user.id !== user?.id) {
			await interaction.reply({
				content: `${CONSTANTS.emojis.statuses.no} You do not have permission to use this command.`,
				ephemeral: true,
			});

			return false;
		}

		const embed = new MessageEmbed(starterMessage.embeds[0]);

		if (updated.body) embed.setDescription(updated.body);

		const promises = [];

		const title = Util.escapeMarkdown(updated.title ?? "");

		promises.push(
			title
				? Promise.race([
						interaction.channel.setName(
							interaction.channel.name.replace(/(?<=^.+ \| ).+$/, title),
							"Suggestion/report edited",
						),
						new Promise((resolve) => setTimeout(resolve, 3_000)),
				  ])
				: Promise.resolve(interaction.channel),
		);

		embed.setTitle(title || embed.title || "");

		promises.push(starterMessage.edit({ embeds: [embed] }));

		await Promise.all(promises);

		return (title ? (await interaction.channel.fetch()).name.endsWith(title) : true)
			? true
			: "ratelimit";
	}
}

/**
 * Get the member who made a suggestion.
 *
 * @param {Message} message - The message to get the member from.
 *
 * @returns {Promise<import("discord.js").GuildMember | import("discord.js").User>} - The member who
 *   made the suggestion.
 * @todo
 *   https://canary.discord.com/channels/806602307750985799/939350305311715358/947385068660359278 was
 *   never fixed?
 */
export async function getUserFromSuggestion(message) {
	const author =
		message.author.id === CONSTANTS.robotop
			? message.embeds[0]?.footer?.text.split(": ")[1]
			: /\/(?<userId>\d+)\//.exec(message.embeds[0]?.author?.iconURL ?? "")?.groups?.userId;

	if (author) {
		const fetchedMember =
			(await message.guild?.members.fetch(author).catch(() => undefined)) ||
			(await message.client?.users.fetch(author).catch(() => undefined));
		if (fetchedMember) return fetchedMember;
	}

	return message.member ?? message.author;
}
