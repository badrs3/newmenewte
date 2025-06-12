import { SlashCommandBuilder  } from "discord.js";

export default  {
    data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Bot ping'),

    async execute(int, bot){
        await int.deferReply({ephemeral:true})
    await int.editReply({content: `${bot.ws.ping}`})
    }
}