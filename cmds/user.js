import { PermissionsBitField, SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const STATUS_COLORS = Object.freeze({
    online: 0x43B581,
    idle: 0xFAA61A,
    dnd: 0xF04747,
    offline: 0x747F8D
});

const PLATFORM_NAMES = Object.freeze({
    desktop: 'كمبيوتر',
    mobile: 'جوال',
    web: 'متصفح'
});

class UserInfoBuilder {
    static calculateAge(timestamp) {
        const today = new Date();
        const createdDate = new Date(timestamp);
        const age = today.getFullYear() - createdDate.getFullYear();
        const hadBirthday = today.getMonth() > createdDate.getMonth() || 
            (today.getMonth() === createdDate.getMonth() && today.getDate() >= createdDate.getDate());
        return hadBirthday ? age : age - 1;
    }

    static formatDate(timestamp) {
        const date = new Date(timestamp);
        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    }

    static getPlatforms(clientStatus) {
        if (!clientStatus) return [];
        return Object.entries(clientStatus)
            .filter(([_, status]) => status)
            .map(([platform]) => PLATFORM_NAMES[platform])
            .filter(Boolean);
    }

    static async getInviteCount(guild, userId) {
        try {
            if (!guild.members.me?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return 0;
            }
            
            const invites = await guild.invites.fetch();
            return invites
                .filter(invite => invite.inviter?.id === userId)
                .reduce((acc, invite) => acc + (invite.uses || 0), 0);
        } catch {
            return 0;
        }
    }

    static buildEmbed(user, member = null, inviteCount = 0) {
        const age = this.calculateAge(user.createdTimestamp);
        const embed = new EmbedBuilder()
            .setAuthor({ name: user.tag })
            .setThumbnail(user.displayAvatarURL({ size: 512 }))
            .addFields({ name: 'تاريخ الإنشاء', value: `${age} Years old`, inline: true })
            .setColor(STATUS_COLORS.offline);

        if (member) {
            const joinDate = this.formatDate(member.joinedTimestamp);
            const roleCount = member.roles.cache.filter(role => role.id !== member.guild.id).size;
            
            embed.addFields(
                { name: 'تاريخ الانضمام', value: joinDate, inline: true },
                { name: 'الرتب', value: roleCount.toString(), inline: true }
            );

            if (inviteCount > 0) {
                embed.addFields({ name: 'الدعوات', value: inviteCount.toString(), inline: true });
            }

            const platforms = this.getPlatforms(member.presence?.clientStatus);
            if (platforms.length > 0) {
                embed.addFields({ name: 'المنصة', value: platforms.join(', '), inline: true });
            }

            const status = member.presence?.status || 'offline';
            embed.setColor(STATUS_COLORS[status] || STATUS_COLORS.offline);
        }

        return embed;
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('عرض معلومات المستخدم')
        .addUserOption(option => option
            .setName('user')
            .setDescription('المستخدم المراد عرض معلوماته')
            .setRequired(false)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user') || interaction.user;
            
            if (!targetUser) {
                throw new Error('User not found');
            }

            if (!interaction.guild) {
                const embed = UserInfoBuilder.buildEmbed(targetUser);
                return await interaction.editReply({ embeds: [embed] });
            }

            const member = interaction.guild.members.cache.get(targetUser.id);
            const inviteCount = await UserInfoBuilder.getInviteCount(interaction.guild, targetUser.id);
            const embed = UserInfoBuilder.buildEmbed(targetUser, member, inviteCount);

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            const errorMessage = 'Failed to fetch user information';
            
            try {
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ content: errorMessage });
                } else if (!interaction.replied) {
                    await interaction.reply({ content: errorMessage, ephemeral: true });
                }
            } catch {}
        }
    }
};