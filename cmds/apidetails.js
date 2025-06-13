import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import https from 'https';
import http from 'http';

const REQUEST_TIMEOUT = 10000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

class APIDetailsManager {
    static validateInputs(apiUrl, apiKey) {
        if (!apiUrl || !apiKey) {
            throw new Error('API URL and key required');
        }
        
        try {
            new URL(apiUrl);
        } catch {
            throw new Error('Invalid URL format');
        }
        
        if (apiKey.length < 8) {
            throw new Error('Invalid API key format');
        }
    }

    static async makeRequest(url, apiKey, attempt = 1) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const client = isHttps ? https : http;
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'User-Agent': 'Discord-Bot/1.0',
                    'Accept': 'application/json'
                },
                timeout: REQUEST_TIMEOUT
            };

            const req = client.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            const parsed = JSON.parse(data);
                            resolve(parsed);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}`));
                        }
                    } catch {
                        reject(new Error('Invalid response format'));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.end();
        });
    }

    static async fetchWithRetry(url, apiKey) {
        let lastError;
        
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                return await this.makeRequest(url, apiKey, attempt);
            } catch (error) {
                lastError = error;
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                }
            }
        }
        
        throw lastError;
    }

    static formatValue(value, type = 'string') {
        if (value === null || value === undefined) return 'N/A';
        
        switch (type) {
            case 'currency':
                return typeof value === 'number' ? `$${value.toFixed(2)}` : value.toString();
            case 'date':
                return value ? new Date(value).toLocaleDateString() : 'N/A';
            case 'number':
                return typeof value === 'number' ? value.toLocaleString() : value.toString();
            default:
                return value.toString();
        }
    }

    static createEmbed(data) {
        const embed = new EmbedBuilder()
            .setTitle('API Account Details')
            .setColor(0x2F3136)
            .setTimestamp();

        const fields = [
            { name: 'Budget', value: this.formatValue(data.budget || data.balance || data.credit, 'currency'), inline: true },
            { name: 'Limit', value: this.formatValue(data.limit || data.quota || data.max_requests, 'number'), inline: true },
            { name: 'Used', value: this.formatValue(data.used || data.usage || data.requests_made, 'number'), inline: true },
            { name: 'Remaining', value: this.formatValue(data.remaining || data.left, 'number'), inline: true },
            { name: 'Reset Date', value: this.formatValue(data.reset_date || data.renewal_date || data.expires, 'date'), inline: true },
            { name: 'Status', value: this.formatValue(data.status || data.state || 'Active'), inline: true }
        ];

        fields.forEach(field => {
            if (field.value !== 'N/A') {
                embed.addFields(field);
            }
        });

        if (data.plan || data.tier) {
            embed.addFields({ name: 'Plan', value: this.formatValue(data.plan || data.tier), inline: true });
        }

        embed.setFooter({ 
            text: 'Bot team is not responsible for any misuse or privacy violations. No data is stored.' 
        });

        return embed;
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('apidetails')
        .setDescription('Display API account details')
        .addStringOption(option => option
            .setName('url')
            .setDescription('API endpoint URL')
            .setRequired(true)
        )
        .addStringOption(option => option
            .setName('key')
            .setDescription('API key')
            .setRequired(true)
        ),

    async execute(interaction) {
        try {
            const apiUrl = interaction.options.getString('url');
            const apiKey = interaction.options.getString('key');

            APIDetailsManager.validateInputs(apiUrl, apiKey);

            await interaction.deferReply({ ephemeral: true });

            const data = await APIDetailsManager.fetchWithRetry(apiUrl, apiKey);
            const embed = APIDetailsManager.createEmbed(data);

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            let errorMsg = 'Service not executed/exist';
            
            if (error.message.includes('required') || error.message.includes('Invalid')) {
                errorMsg = error.message;
            } else if (error.message.includes('HTTP')) {
                errorMsg = 'Authentication None';
            } else if (error.message.includes('timeout')) {
                errorMsg = 'Request timeout';
            }

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