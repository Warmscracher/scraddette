/** @file Commands To manage modmails. */
import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageEmbed } from "discord.js";
import CONSTANTS from "../common/CONSTANTS.js";

import {
	closeModmail,
	COLORS,
	generateConfirm,
	getThreadFromMember,
	MODMAIL_CHANNEL,
	sendOpenedMessage,
	UNSUPPORTED,
} from "../common/modmail.js";

/** @type {import("../types/command").default} */
const info = {
	data: new SlashCommandBuilder()
		.setDefaultPermission(false)
		.setDescription(".")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("close")
				.setDescription("(Mods only) Close a modmail ticket.")
				.addStringOption((input) =>
					input
						.setName("reason")
						.setDescription(
							"Reason for closing the ticket (this will be posted here as well as being sent to the user)",
						)
						.setRequired(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("start")
				.setDescription(
					"(Mods only) Start a modmail ticket with a user. (Non-mods may start a ticket by DMing me.)",
				)
				.addUserOption((input) =>
					input
						.setName("user")
						.setDescription("The user to start a ticket with.")
						.setRequired(true),
				),
		),

	async interaction(interaction) {
		const command = interaction.options.getSubcommand();

		switch (command) {
			case "close": {
				if (
					interaction.channel?.type !== "GUILD_PUBLIC_THREAD" ||
					interaction.channel.parent?.id !== MODMAIL_CHANNEL ||
					!interaction.guild
				) {
					await interaction.reply({
						content: `${CONSTANTS.emojis.statuses.no} This command may only be used in threads in <#${MODMAIL_CHANNEL}>.`,
						ephemeral: true,
					});

					return;
				}

				const reason = interaction.options.getString("reason") ?? "";

				await interaction.reply({
					content: `${CONSTANTS.emojis.statuses.yes} **Modmail ticket closed!** ${reason}`,
				});

				await closeModmail(interaction.channel, interaction.user, reason);

				break;
			}
			case "start": {
				const user = await interaction.guild?.members.fetch(
					interaction.options.getUser("user") ?? "",
				);

				if (!user || !interaction.guild) {
					await interaction.reply({
						content: `${CONSTANTS.emojis.statuses.no} Could not find user.`,
						ephemeral: true,
					});

					return;
				}

				const existingThread = await getThreadFromMember(interaction.guild, user);

				if (existingThread) {
					await interaction.reply({
						content: `${
							CONSTANTS.emojis.statuses.no
						} User already has a ticket open (${existingThread.toString()}).`,
						ephemeral: true,
					});

					return;
				}

				const mailChannel = await interaction.guild.channels.fetch(MODMAIL_CHANNEL);

				if (!mailChannel) throw new ReferenceError("Could not find modmail channel");

				if (mailChannel.type !== "GUILD_TEXT")
					throw new TypeError("Modmail channel is not a text channel");

				await generateConfirm(
					{
						display: user?.user.toString(),
						icon: user.displayAvatarURL(),
						name: user.displayName,
					},

					async (buttonInteraction) => {
						const openedEmbed = new MessageEmbed()
							.setTitle("Modmail ticket opened!")
							.setDescription(
								`Ticket to ${user.toString()} (by ${interaction.user.toString()})`,
							)
							.setFooter({
								text: UNSUPPORTED,
							})
							.setColor(COLORS.opened);

						await sendOpenedMessage(user).then(async (success) => {
							if (success) {
								const starterMessage = await mailChannel.send({
									embeds: [openedEmbed],
								});
								const thread = await starterMessage.startThread({
									name: `${user.user.username}`,
									autoArchiveDuration: "MAX",
								});
								await buttonInteraction.reply({
									content: `${
										CONSTANTS.emojis.statuses.yes
									} **Modmail ticket opened!** Send ${user.toString()} a message in ${thread.toString()}.`,
									ephemeral: true,
								});
							} else {
								await buttonInteraction.reply({
									content: `${CONSTANTS.emojis.statuses.no} Could not DM user. Ask them to open their DMs.`,

									ephemeral: true,
								});
							}
						});
					},
					(options) =>
						interaction.reply({ ...options, ephemeral: true, fetchReply: true }),
					(options) => interaction.editReply(options),
				);

				break;
			}
		}
	},

	permissions: [{ id: process.env.MODERATOR_ROLE || "", permission: true, type: "ROLE" }],
};

export default info;
