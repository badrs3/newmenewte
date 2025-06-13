import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Bot ping'),

    async execute(interaction, client) {
        try {
            if (!client?.ws?.ping) {
                throw new Error('Client WebSocket unavailable');
            }

            await interaction.deferReply({ ephemeral: true });
            
            const ping = Math.max(0, client.ws.ping);
            
            await interaction.editReply({
                content: `${ping}ms`
            });
        } catch (error) {
            const errorMsg = 'Service unavailable';
            
            try {
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ content: errorMsg });
                } else if (!interaction.replied) {
                    await interaction.reply({ content: errorMsg, ephemeral: true });
                }
            } catch {}
        }
    }
};