import { PermissionsBitField, SlashCommandBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName('uclear')
        .setDescription('مسح رسائل المستخدم')
            .addIntegerOption(option =>
            option
                .setName('count')
                .setDescription('عدد الرسائل المراد مسحها')
                .setRequired(true)
                .setMinValue(1)
        )
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('المستخدم المراد مسح رسائله')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('سبب المسح')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const reason = interaction.options.getString('reason') || 'غير محدد';
            const count = interaction.options.getInteger('count') || 100;
            if(!interaction.guild) return;
            const isSelf = targetUser.id === interaction.user.id;
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages);
            
            if (!isSelf && !isAdmin) {
                return await interaction.reply({
                    content: "ليس لديك صلاحية لمسح رسائل الآخرين",
                    ephemeral: true
                });
            }
            
            if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return await interaction.reply({
                    content: "البوت لا يملك صلاحية مسح الرسائل",
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const channels = interaction.guild.channels.cache.filter(channel => 
                channel.isTextBased() && 
                channel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ReadMessageHistory) &&
                channel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ManageMessages)
            );

            let totalDeleted = 0;
            let processedChannels = 0;
            const maxChannels = Math.min(channels.size, 50);

            for (const [channelId, channel] of channels) {
                if (processedChannels >= maxChannels) break;
                processedChannels++;

                try {
                    let remainingCount = count;
                    let lastMessageId = null;
                    let channelDeleted = 0;

                    while (remainingCount > 0) {
                        const fetchOptions = {
                            limit: Math.min(remainingCount, 100),
                            cache: false
                        };
                        
                        if (lastMessageId) {
                            fetchOptions.before = lastMessageId;
                        }

                        const messages = await channel.messages.fetch(fetchOptions);
                        
                        if (messages.size === 0) break;

                        const userMessages = messages.filter(msg => msg.author.id === targetUser.id);
                        
                        if (userMessages.size === 0) {
                            lastMessageId = messages.last()?.id;
                            continue;
                        }

                        const now = Date.now();
                        const bulkMessages = userMessages.filter(msg => now - msg.createdTimestamp < 1209600000);
                        const oldMessages = userMessages.filter(msg => now - msg.createdTimestamp >= 1209600000);

                        if (bulkMessages.size >= 2) {
                            try {
                                await channel.bulkDelete(bulkMessages);
                                channelDeleted += bulkMessages.size;
                                totalDeleted += bulkMessages.size;
                                remainingCount -= bulkMessages.size;
                            } catch (error) {
                                for (const msg of bulkMessages.values()) {
                                    try {
                                        await msg.delete();
                                        channelDeleted++;
                                        totalDeleted++;
                                        remainingCount--;
                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                    } catch {}
                                }
                            }
                        } else if (bulkMessages.size === 1) {
                            try {
                                await bulkMessages.first().delete();
                                channelDeleted++;
                                totalDeleted++;
                                remainingCount--;
                            } catch {}
                        }

                        for (const msg of oldMessages.values()) {
                            if (remainingCount <= 0) break;
                            try {
                                await msg.delete();
                                channelDeleted++;
                                totalDeleted++;
                                remainingCount--;
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            } catch {}
                        }

                        if (messages.size < 100) break;
                        lastMessageId = messages.last()?.id;
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                } catch (error) {
                    console.error(`Error in channel ${channel.name}:`, error);
                }

                if (processedChannels % 5 === 0) {
                    try {
                        await interaction.editReply({
                            content: `جاري المسح... تم مسح ${totalDeleted} رسالة من ${processedChannels} قناة`
                        });
                    } catch {}
                }
            }

            const resultMessage = isSelf 
                ? `تم مسح ${totalDeleted} رسالة من رسائلك`
                : `تم مسح ${totalDeleted} رسالة من ${targetUser.tag}\nالسبب: ${reason}`;

            await interaction.editReply({ content: resultMessage });

        } catch (error) {
            console.error('UClear command error:', error);
            
            try {
                const errorMessage = { content: "حدث خطأ أثناء مسح الرسائل" };
                
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