import { PermissionsBitField, SlashCommandBuilder } from 'discord.js';

const BULK_DELETE_AGE_LIMIT = 1209600000;
const MAX_CHANNELS = 50;
const BATCH_SIZE = 100;
const DELETE_DELAY = 1000;
const FETCH_DELAY = 500;
const PROGRESS_UPDATE_INTERVAL = 5;

class MessageCleaner {
    static validatePermissions(interaction, targetUser) {
        if (!interaction.guild) {
            throw new Error('Guild only command');
        }

        const isSelf = targetUser.id === interaction.user.id;
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages);
        
        if (!isSelf && !isAdmin) {
            throw new Error('Insufficient permissions');
        }
        
        if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            throw new Error('Bot lacks required permissions');
        }

        return isSelf;
    }

    static getEligibleChannels(guild) {
        return guild.channels.cache.filter(channel => 
            channel.isTextBased() && 
            channel.permissionsFor(guild.members.me)?.has([
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageMessages
            ])
        );
    }

    static async deleteMessages(messages, remainingCount) {
        const now = Date.now();
        const bulkMessages = messages.filter(msg => now - msg.createdTimestamp < BULK_DELETE_AGE_LIMIT);
        const oldMessages = messages.filter(msg => now - msg.createdTimestamp >= BULK_DELETE_AGE_LIMIT);
        let deleted = 0;

        if (bulkMessages.size >= 2) {
            try {
                await messages.first().channel.bulkDelete(bulkMessages);
                deleted += bulkMessages.size;
            } catch {
                deleted += await this.deleteIndividually(bulkMessages, remainingCount - deleted);
            }
        } else if (bulkMessages.size === 1) {
            try {
                await bulkMessages.first().delete();
                deleted++;
            } catch {}
        }

        if (deleted < remainingCount && oldMessages.size > 0) {
            deleted += await this.deleteIndividually(oldMessages, remainingCount - deleted);
        }

        return deleted;
    }

    static async deleteIndividually(messages, maxCount) {
        let deleted = 0;
        for (const msg of messages.values()) {
            if (deleted >= maxCount) break;
            try {
                await msg.delete();
                deleted++;
                if (deleted < maxCount) {
                    await new Promise(resolve => setTimeout(resolve, DELETE_DELAY));
                }
            } catch {}
        }
        return deleted;
    }

    static async clearUserMessages(interaction, targetUser, count) {
        const channels = this.getEligibleChannels(interaction.guild);
        let totalDeleted = 0;
        let processedChannels = 0;
        const maxChannels = Math.min(channels.size, MAX_CHANNELS);

        for (const [, channel] of channels) {
            if (processedChannels >= maxChannels || totalDeleted >= count) break;
            processedChannels++;

            try {
                let remainingCount = count - totalDeleted;
                let lastMessageId = null;

                while (remainingCount > 0) {
                    const fetchOptions = {
                        limit: Math.min(remainingCount, BATCH_SIZE),
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

                    const deleted = await this.deleteMessages(userMessages, remainingCount);
                    totalDeleted += deleted;
                    remainingCount -= deleted;

                    if (messages.size < BATCH_SIZE) break;
                    lastMessageId = messages.last()?.id;
                    await new Promise(resolve => setTimeout(resolve, FETCH_DELAY));
                }
            } catch {}

            if (processedChannels % PROGRESS_UPDATE_INTERVAL === 0) {
                try {
                    await interaction.editReply({
                        content: `Processing... ${totalDeleted} messages deleted from ${processedChannels} channels`
                    });
                } catch {}
            }
        }

        return totalDeleted;
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('uclear')
        .setDescription('Clear user messages')
        .addIntegerOption(option => option
            .setName('count')
            .setDescription('Number of messages to delete')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000)
        )
        .addUserOption(option => option
            .setName('user')
            .setDescription('Target user')
            .setRequired(false)
        )
        .addStringOption(option => option
            .setName('reason')
            .setDescription('Deletion reason')
            .setRequired(false)
            .setMaxLength(200)
        ),

    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const reason = interaction.options.getString('reason') || 'Not specified';
            const count = interaction.options.getInteger('count');

            const isSelf = MessageCleaner.validatePermissions(interaction, targetUser);
            
            await interaction.deferReply({ ephemeral: true });

            const totalDeleted = await MessageCleaner.clearUserMessages(interaction, targetUser, count);

            const resultMessage = isSelf 
                ? `Deleted ${totalDeleted} messages`
                : `Deleted ${totalDeleted} messages from ${targetUser.tag}\nReason: ${reason}`;

            await interaction.editReply({ content: resultMessage });

        } catch (error) {
            const errorMessage = error.message.includes('permissions') ? error.message : 'Failed to delete messages';
            
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