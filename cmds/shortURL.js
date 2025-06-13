import { SlashCommandBuilder } from 'discord.js';
import tinyurl from 'tinyurl';

const URL_REGEX = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
const MAX_RETRIES = 2;
const TIMEOUT_MS = 10000;
const COOLDOWN_MS = 180000; // 3 minutes

const NSFW_DOMAINS = [
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'redtube.com', 'youporn.com',
    'tube8.com', 'spankbang.com', 'xhamster.com', 'beeg.com', 'sex.com',
    'porn.com', 'xxx.com', 'adult.com', 'chaturbate.com', 'cam4.com',
    'livejasmin.com', 'stripchat.com', 'bongacams.com', 'camsoda.com',
    'onlyfans.com', 'manyvids.com', 'clips4sale.com'
];

const NSFW_KEYWORDS = [
    'porn', 'xxx', 'sex', 'nude', 'naked', 'adult', 'nsfw', 'erotic', 'hotgirl', 'pussy',
];

const userCooldowns = new Map();

class URLShortener {
    static validateURL(url) {
        return typeof url === 'string' && URL_REGEX.test(url);
    }

    static isNSFW(url) {
        const urlLower = url.toLowerCase();
        
        // Check domains
        for (const domain of NSFW_DOMAINS) {
            if (urlLower.includes(domain)) {
                return true;
            }
        }
        
        // Check keywords
        for (const keyword of NSFW_KEYWORDS) {
            if (urlLower.includes(keyword)) {
                return true;
            }
        }
        
        return false;
    }

    static checkCooldown(userId) {
        const lastUsed = userCooldowns.get(userId);
        if (!lastUsed) return { onCooldown: false };
        
        const timeLeft = COOLDOWN_MS - (Date.now() - lastUsed);
        if (timeLeft > 0) {
            const minutesLeft = Math.ceil(timeLeft / 60000);
            return { onCooldown: true, timeLeft: minutesLeft };
        }
        
        return { onCooldown: false };
    }

    static setCooldown(userId) {
        userCooldowns.set(userId, Date.now());
    }

    static async shortenWithTimeout(url, alias = null) {
        return Promise.race([
            alias ? tinyurl.shortenWithAlias(url, alias) : tinyurl.shorten(url),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), TIMEOUT_MS)
            )
        ]);
    }

    static async attemptShorten(url, alias = null, retries = MAX_RETRIES) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const result = await this.shortenWithTimeout(url, alias);
                
                if (typeof result === 'string' && !result.toLowerCase().includes('error')) {
                    return { success: true, url: result };
                }
                
                return { success: false, error: result };
            } catch (error) {
                if (attempt === retries) {
                    return { success: false, error: error.message };
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('shorturl')
        .setDescription('Make ur url link short')
        .addStringOption(option => option
            .setName('url')
            .setDescription('put ur url')
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(400)
        )
        .addStringOption(option => option
            .setName('alias')
            .setDescription('put the alias')
            .setRequired(false)
            .setMinLength(3)
            .setMaxLength(80)
        ),

    async execute(interaction) {
        try {
            const url = interaction.options.getString('url');
            const alias = interaction.options.getString('alias');
            const userId = interaction.user.id;
            
            if (!url || !URLShortener.validateURL(url)) {
                return await interaction.reply({
                    content: 'Invalid URL format',
                    ephemeral: true
                });
            }

            if (URLShortener.isNSFW(url)) {
                return await interaction.reply({
                    content: 'NSFW content not allowed',
                    ephemeral: true
                });
            }

            const cooldownCheck = URLShortener.checkCooldown(userId);
            if (cooldownCheck.onCooldown) {
                return await interaction.reply({
                    content: `Cooldown active. ${cooldownCheck.timeLeft} minutes remaining`,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });
            
            const result = await URLShortener.attemptShorten(url, alias);
            
            if (result.success) {
                URLShortener.setCooldown(userId);
                await interaction.editReply({
                    content: result.url
                });
            } else {
                await interaction.editReply({
                    content: 'Service unavailable'
                });
            }
            
        } catch (error) {
            const errorMsg = 'Service error';
            
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