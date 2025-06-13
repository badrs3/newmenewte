import { PermissionsBitField, SlashCommandBuilder } from 'discord.js';

const BATCH_SIZE = 5;
const DELAY_MS = 1000;
const PROGRESS_UPDATE_INTERVAL = 2;

class UnbanManager {
    static validatePermissions(guild) {
        if (!guild.members.me?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            throw new Error('Bot lacks required permissions');
        }
    }

    static async fetchBans(guild) {
        try {
            const bans = await guild.bans.fetch();
            if (bans.size === 0) {
                throw new Error('No banned users found');
            }
            return Array.from(bans.keys());
        } catch (error) {
            if (error.message.includes('banned')) {
                throw error;
            }
            throw new Error('Failed to fetch ban list');
        }
    }

    static async unbanUser(guild, userId) {
        try {
            await guild.members.unban(userId, 'Bulk unban command');
            return { success: true, userId };
        } catch {
            return { success: false, userId };
        }
    }

    static async processBatch(guild, userIds) {
        const promises = userIds.map(userId => this.unbanUser(guild, userId));
        const results = await Promise.allSettled(promises);
        
        return results.map(result => 
            result.status === 'fulfilled' ? result.value : { success: false }
        );
    }

    static async unbanAll(interaction, userIds) {
        let successful = 0;
        let failed = 0;
        const total = userIds.length;

        for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
            const batch = userIds.slice(i, i + BATCH_SIZE);
            const results = await this.processBatch(interaction.guild, batch);
            
            results.forEach(result => {
                if (result.success) {
                    successful++;
                } else {
                    failed++;
                }
            });

            const processed = Math.min(i + BATCH_SIZE, total);
            if (processed % (BATCH_SIZE * PROGRESS_UPDATE_INTERVAL) === 0 || processed === total) {
                try {
                    await interaction.editReply({
                        content: `Processing... (${processed}/${total})`
                    });
                } catch {}
            }

            if (i + BATCH_SIZE < userIds.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
        }

        return { successful, failed };
    }

    static formatResult(successful, failed) {
        let message = `Unbanned ${successful} users`;
        if (failed > 0) {
            message += `\nFailed to unban ${failed} users`;
        }
        return message;
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban all users')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
        .addSubcommand(subcommand => subcommand
            .setName('all')
            .setDescription('Unban all users')
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            UnbanManager.validatePermissions(interaction.guild);
            const userIds = await UnbanManager.fetchBans(interaction.guild);
            const { successful, failed } = await UnbanManager.unbanAll(interaction, userIds);
            const resultMessage = UnbanManager.formatResult(successful, failed);

            await interaction.editReply({ content: resultMessage });

        } catch (error) {
            const errorMessage = error.message.includes('Bot') || error.message.includes('No banned') || error.message.includes('Failed') 
                ? error.message 
                : 'Command execution failed';
            
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