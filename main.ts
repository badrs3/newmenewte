import {Client, Collection, ActivityType, RESTPostAPIChatInputApplicationCommandsJSONBody, ChatInputCommandInteraction } from'discord.js';
import {readdirSync} from'fs'
import {REST} from'@discordjs/rest'
import {Routes} from'discord-api-types/v10'

import dotenv from 'dotenv';
dotenv.config();

const token = process.env.TOKEN;
const clientId = process.env.CLIENTID
const bot = new Client({ intents: 106191 }) as Client & {
  commands: Collection<string, any>;
};
bot.login(token);

bot.commands = new Collection();

const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
const files = readdirSync('cmds').filter(s => s.endsWith('.js'))
for (let file of files){
const command = await import(`./cmds/${file}`) as { default: any };
if (!command?.default?.data || !command?.default?.execute) continue;
    commands.push(command.default.data.toJSON())
bot.commands.set(command.default.data.name, command.default)
}

const rest = new REST({version: "10"}).setToken(`${token}`);

(async() => {
    try{
      await rest.put(Routes.applicationCommands(`${clientId}`), {
        body: commands
      })
    }catch(Err){
        console.log(Err)
    }
})()

bot.on('ready', async() => {
    bot.user?.setPresence({activities: [{name: "PBP", type: ActivityType.Watching}], status: "dnd"})
    console.log('bot ready')
})

bot.on('interactionCreate', async(int) => {
      if (!int.isCommand()) return;

  const command = bot.commands.get((int as ChatInputCommandInteraction).commandName);
  if (!command) return;

    try{
     await command.execute(int, bot)
    }catch(Err){
        console.log(Err)
    }
})
