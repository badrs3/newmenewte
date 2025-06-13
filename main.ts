import { Client, Collection, ActivityType, RESTPostAPIChatInputApplicationCommandsJSONBody, ChatInputCommandInteraction } from 'discord.js';
import { readdirSync } from 'fs';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import dotenv from 'dotenv';

interface Command {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void>;
}

interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

class BotManager {
  private readonly client: ExtendedClient;
  private readonly rest: REST;
  private readonly token: string;
  private readonly clientId: string;

  constructor() {
    dotenv.config();
    
    this.token = this.validateEnvVar('TOKEN');
    this.clientId = this.validateEnvVar('CLIENTID');
    
    this.client = new Client({ intents: 106191 }) as ExtendedClient;
    this.client.commands = new Collection();
    this.rest = new REST({ version: '10' }).setToken(this.token);
  }

  private validateEnvVar(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  }

  private async loadCommands(): Promise<RESTPostAPIChatInputApplicationCommandsJSONBody[]> {
    const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
    
    try {
      const files = readdirSync('cmds').filter(file => file.endsWith('.js'));
      
      for (const file of files) {
        try {
          const commandModule = await import(`./cmds/${file}`) as { default?: Command };
          const command = commandModule.default;
          
          if (command?.data?.name && typeof command.execute === 'function') {
            commands.push(command.data.toJSON());
            this.client.commands.set(command.data.name, command);
          }
        } catch (error) {
          console.error(`Failed to load command ${file}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to read commands directory:', error);
    }
    
    return commands;
  }

  private async registerCommands(commands: RESTPostAPIChatInputApplicationCommandsJSONBody[]): Promise<void> {
    try {
      await this.rest.put(Routes.applicationCommands(this.clientId), { body: commands });
    } catch (error) {
      console.error('Failed to register commands:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    this.client.once('ready', () => {
      if (this.client.user) {
        this.client.user.setPresence({
          activities: [{ name: 'PBP', type: ActivityType.Watching }],
          status: 'dnd'
        });
      }
      console.log('Bot ready');
    });

    this.client.on('interactionCreate', async (int) => {
      if (!int.isCommand()) return;

      const command = this.client.commands.get(int.commandName);
      if (!command) return;

      try {
        if (int.isChatInputCommand()) {
            await command.execute(int, this.client);
        }
      } catch (error) {
        console.error(`Command execution failed for ${int.commandName}:`, error);
      }
    });

    this.client.on('error', (error) => {
      console.error('Discord client error:', error);
    });

    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private async shutdown(): Promise<void> {
    console.log('Shutting down bot...');
    this.client.destroy();
    process.exit(0);
  }

  async start(): Promise<void> {
    try {
      const commands = await this.loadCommands();
      await this.registerCommands(commands);
      this.setupEventHandlers();
      await this.client.login(this.token);
    } catch (error) {
      console.error('Failed to start bot:', error);
      process.exit(1);
    }
  }
}

const bot = new BotManager();
bot.start().catch(console.error);
