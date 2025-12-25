import { Context } from 'telegraf';
import { removeLinkFromDatabase, getUserLinks } from '../../db/index';
import { mainMenuKeyboard } from '../ui';

export const removeLink = async (ctx: Context, linkToRemove: string) => {
    const userId = ctx.from?.id;
    if (!userId) {
        ctx.reply('Не вдалося визначити ідентифікатор користувача.');
        return;
    }

    const userLinks = await getUserLinks(userId);
    const has = userLinks.some(l => l.link === linkToRemove);
    if (!has) {
        ctx.reply('У вас немає цього посилання в списку відстеження.');
        return;
    }

    await removeLinkFromDatabase(userId, linkToRemove);
    await ctx.reply(`Посилання ${linkToRemove} видалено зі списку відстеження.`);
};