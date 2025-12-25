import { Context } from 'telegraf';
import { getUserLinks } from '../../db/index';
import { getUserState, setUserState } from '../../redis';
import { mainMenuKeyboard } from '../ui';

export const listLinksCommand = async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) {
        ctx.reply('Не вдалося визначити ідентифікатор користувача.');
        return;
    }
    try {
        const links = await getUserLinks(userId);
        if (!links || links.length === 0) {
            ctx.reply('ℹ️ У вас ще немає доданих посилань для відстеження.');
            return;
        }
        // send up to 5 separate messages, one per link, each with its own inline keyboard
        const limit = Math.min(links.length, 5);
        const sentMessageIds: number[] = [];
        for (let idx = 0; idx < limit; idx++) {
            const row: any = links[idx];
            const statusEmoji = row.last_status === null ? '⏳' : row.last_status ? '❌' : '✅';
            const notified = row.notified ? '🔔' : '';
            const lastChecked = row.last_checked_at ? ` (перевірено: ${new Date(row.last_checked_at).toLocaleString()})` : '';
            const text = `${statusEmoji} <b>${idx + 1}.</b> ${row.link} ${notified}${lastChecked}`;
            const keyboard = [
                [ { text: 'Видалити ❌', callback_data: `remove:${row.id}` } ],
                [ { text: 'Позначити як відсутнє 🚫', callback_data: `absent:${row.id}` } ]
            ];
            const msg = await ctx.replyWithHTML(text, { reply_markup: { inline_keyboard: keyboard } });
            sentMessageIds.push(msg.message_id);
        }
        // store message ids to allow deletion on subsequent actions
        setUserState(String(ctx.from?.id ?? ''), { messages: sentMessageIds });
        if (links.length > 5) {
            const moreMsg = await ctx.reply(`ℹ️ Показано перші 5 з ${links.length} посилань.`);
            // include that message id as well
            setUserState(String(ctx.from?.id ?? ''), { messages: sentMessageIds.concat([moreMsg.message_id]) });
        }
        // show main menu after listing
        await ctx.replyWithHTML('Головне меню', { reply_markup: mainMenuKeyboard() } as any);
    } catch (error) {
        console.error("Error retrieving links:", error);
        ctx.reply('❌ Виникла помилка при отриманні ваших посилань. Спробуйте ще раз.');
    }
};