import { guild } from "../../../client.js";
import CONSTANTS from "../../../common/CONSTANTS.js";
import log from "../../../common/moderation/logging.js";
import { closeModmail, getThreadFromMember } from "../../../common/modmail.js";
import breakRecord from "../../../common/records.js";
import { usersDatabase } from "./add.js";

/** @type {import("../../../common/types/event").default<"guildMemberAdd">} */
export default async function event(member) {
	if (member.guild.id !== process.env.GUILD_ID) return;
	await log(`💨 Member ${member.toString()} left!`, "members");

	const byes = [
		`😩 Welp… **${member.user.username}** decided to leave… what a shame…`,
		`⬅ Ahh… **${member.user.username}** left us… hope they’ll have safe travels!`,
		`**${member.user.username}** made a bad decision and left! 😦 I wonder why… 🤔`,
		`👎 For some reason **${member.user.username}** didn’t like it here…`,
		`Can we get an F in the chat for **${member.user.username}**? They left! 😭`,
		`🍴 Ope, **${member.user.username}** got eaten by an evil kumquat and left!`,
	];

	const banned = await guild.bans
		.fetch(member)
		.then((partialBan) => {
			if (partialBan.partial) return partialBan.fetch();
			return partialBan;
		})
		.catch(() => {});

	const bans = [
		`😦 Oof… **${member.user.username}** got banned…`,
		`${CONSTANTS.emojis.statuses.no} There’s no turning back for the banned **${member.user.username}**…`,
		`👨‍🏫 Remember kids, don’t follow **${member.user.username}**’s example, it gets you banned.`,
		`😡 Oop, **${member.user.username}** angered the mods and was banned!`,
		`📜 **${member.user.username}** broke the rules and took an L`,
		`💬 **${member.user.username}** was banned for talking about opacity slider too much. (JK, that’s not why.)`,
	];

	const promises = [
		CONSTANTS.channels.welcome?.send(
			(banned
				? bans[Math.floor(Math.random() * bans.length)]
				: byes[Math.floor(Math.random() * byes.length)]) || "",
		),
		getThreadFromMember(member).then(async (thread) => {
			if (thread) closeModmail(thread, member.user, "Member left");
		}),
	];
	if (banned && member.joinedAt)
		promises.push(breakRecord(3, [member], Date.now() - +member.joinedAt));

	usersDatabase.data = usersDatabase.data.filter(
		({ user, time }) => user === member.id || time + 86_400_000 > Date.now(),
	);

	await Promise.all(promises);
}
