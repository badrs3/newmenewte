import { PermissionsBitField, SlashCommandBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban all users')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
        .addSubcommand(subcommand => 
            subcommand
                .setName('all')
                .setDescription('Unban all users')
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const botMember = interaction.guild.members.me;
            if (!botMember.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return await interaction.editReply({
                    content: "البوت لا يملك صلاحية إلغاء الحظر"
                });
            }

            let bans;
            try {
                bans = await interaction.guild.bans.fetch();
            } catch (error) {
                console.error('Failed to fetch bans:', error);
                return await interaction.editReply({
                    content: "فشل في جلب قائمة المحظورين"
                });
            }

            if (bans.size === 0) {
                return await interaction.editReply({
                    content: "لا يوجد مستخدمين محظورين"
                });
            }

            const BATCH_SIZE = 5;
            
            let successful = 0;
            let failed = 0;
            const totalBans = bans.size;
            
            const banEntries = Array.from(bans.entries());
            
            for (let i = 0; i < banEntries.length; i += BATCH_SIZE) {
                const batch = banEntries.slice(i, i + BATCH_SIZE);
                
                const batchPromises = batch.map(async ([userId, banInfo]) => {
                    try {
                        await interaction.guild.members.unban(userId, "Bulk unban command");
                        return { success: true, userId };
                    } catch (error) {
                        console.error(`Failed to unban user ${userId}:`, error);
                        return { success: false, userId, error: error.message };
                    }
                });

                const batchResults = await Promise.allSettled(batchPromises);
                
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled' && result.value.success) {
                        successful++;
                    } else {
                        failed++;
                    }
                });

                if ((i + BATCH_SIZE) % (BATCH_SIZE * 2) === 0 || i + BATCH_SIZE >= banEntries.length) {
                    const processed = Math.min(i + BATCH_SIZE, banEntries.length);
                    try {
                        await interaction.editReply({
                            content: `جاري إلغاء الحظر... (${processed}/${totalBans})`
                        });
                    } catch (error) {
                    }
                }

                if (i + BATCH_SIZE < banEntries.length) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                }
            }

            let resultMessage = `تم إلغاء الحظر عن ${successful} مستخدم`;
            
            if (failed > 0) {
                resultMessage += `\n فشل في إلغاء الحظر عن ${failed} مستخدم`;
            }

            await interaction.editReply({ content: resultMessage });

        } catch (error) {
            console.error('Unban command error:', error);
            
            try {
                const errorMessage = interaction.deferred || interaction.replied 
                    ? { content: " حدث خطأ أثناء تنفيذ الأمر" }
                    : { content: " حدث خطأ أثناء تنفيذ الأمر", ephemeral: true };
                
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply(errorMessage);
                } else if (!interaction.replied) {
                    await interaction.reply(errorMessage);
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    }
};