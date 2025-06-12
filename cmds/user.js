import { PermissionsBitField, SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('عرض معلومات المستخدم')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('المستخدم المراد عرض معلوماته')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user') || interaction.user;
            
            if (!interaction.guild) {
                const createdDate = new Date(targetUser.createdTimestamp);
                const formattedDate = `${createdDate.getDate().toString().padStart(2, '0')}/${(createdDate.getMonth() + 1).toString().padStart(2, '0')}/${createdDate.getFullYear()}`;
                
                const embed = new EmbedBuilder()
                    .setAuthor({ name: targetUser.tag })
                    .setThumbnail(targetUser.displayAvatarURL({ size: 512 }))
                    .addFields({ name: 'تاريخ الإنشاء', value: formattedDate, inline: true })
                    .setColor(0x747F8D);

                return await interaction.editReply({ embeds: [embed] });
            }

            const member = interaction.guild.members.cache.get(targetUser.id);
            
            const createdDate = new Date(targetUser.createdTimestamp);
            const formattedCreatedDate = `${createdDate.getDate().toString().padStart(2, '0')}/${(createdDate.getMonth() + 1).toString().padStart(2, '0')}/${createdDate.getFullYear()}`;
            
            let embed = new EmbedBuilder()
                .setAuthor({ name: targetUser.tag })
                .setThumbnail(targetUser.displayAvatarURL({ size: 512 }))
                .addFields({ name: 'تاريخ الإنشاء', value: formattedCreatedDate, inline: true });

            if (member) {
                const joinedDate = new Date(member.joinedTimestamp);
                const formattedJoinedDate = `${joinedDate.getDate().toString().padStart(2, '0')}/${(joinedDate.getMonth() + 1).toString().padStart(2, '0')}/${joinedDate.getFullYear()}`;
                
                const roleCount = member.roles.cache.filter(role => role.id !== interaction.guild.id).size;
                
                embed.addFields(
                    { name: 'تاريخ الانضمام', value: formattedJoinedDate, inline: true },
                    { name: 'الرتب', value: roleCount.toString(), inline: true }
                );

                if (interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    try {
                        const invites = await interaction.guild.invites.fetch();
                        const userInvites = invites.filter(invite => invite.inviter?.id === targetUser.id);
                        const totalUses = userInvites.reduce((acc, invite) => acc + (invite.uses || 0), 0);
                        
                        embed.addFields({ name: 'الدعوات', value: totalUses.toString(), inline: true });
                    } catch (error) {
                    }
                }

                if (interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ReadMessageHistory)) {
                    try {
                        const channels = interaction.guild.channels.cache
                            .filter(channel => channel.isTextBased() && 
                                   channel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ReadMessageHistory))
                            .first(5);

                        let messageCount = 0;
                        const promises = channels.map(async (channel) => {
                            try {
                                const messages = await channel.messages.fetch({ 
                                    limit: 100,
                                    cache: false 
                                });
                                return messages.filter(msg => msg.author.id === targetUser.id).size;
                            } catch {
                                return 0;
                            }
                        });

                        const counts = await Promise.allSettled(promises);
                        messageCount = counts
                            .filter(result => result.status === 'fulfilled')
                            .reduce((acc, result) => acc + result.value, 0);

                        if (messageCount > 0) {
                            embed.addFields({ name: 'الرسائل', value: messageCount.toString(), inline: true });
                        }
                    } catch (error) {
                    }
                }
            }

            const presence = member?.presence;
            if (presence && presence.clientStatus) {
                const platforms = [];
                if (presence.clientStatus.desktop) platforms.push('كمبيوتر');
                if (presence.clientStatus.mobile) platforms.push('جوال');
                if (presence.clientStatus.web) platforms.push('متصفح');
                
                if (platforms.length > 0) {
                    embed.addFields({ name: 'المنصة', value: platforms.join(', '), inline: true });
                }
            }

            if (member) {
                const status = member.presence?.status;
                const colors = {
                    online: 0x43B581,
                    idle: 0xFAA61A,
                    dnd: 0xF04747,
                    offline: 0x747F8D
                };
                embed.setColor(colors[status] || colors.offline);
            } else {
                embed.setColor(0x747F8D);
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('User command error:', error);
            
            try {
                const errorMessage = { content: "حدث خطأ أثناء جلب المعلومات" };
                
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply(errorMessage);
                } else if (!interaction.replied) {
                    await interaction.reply({ ...errorMessage, ephemeral: true });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    }
};