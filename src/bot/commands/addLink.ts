import { Context } from 'telegraf';
import { addLinkToDatabase, getUserLinks } from '../../db/index';
import { redisClient, setUserState, clearUserState } from '../../redis';
import { backToMainButton, mainMenuKeyboard } from '../ui';

const MAX_LINKS = 5;

export const addLink = async (ctx: Context, link: string) => {
    const userId = ctx.from?.id;
    if (!userId) {
        ctx.reply('Не вдалося визначити ідентифікатор користувача.');
        return;
    }

    if (!link) {
        // start interactive flow
        const prompt = await ctx.reply('Надішліть посилання, яке хочете відстежувати, або натисніть кнопку назад.', { reply_markup: backToMainButton() });
        // store prompt message id so we can clean up later
        setUserState(String(userId), { step: 'awaiting_link', messages: [prompt.message_id] });
        return;
    }

    const userLinks = await getUserLinks(userId);

    // prevent duplicates for the same user
    if (userLinks.some((l: any) => l.link === link)) {
        await ctx.reply('⚠️ Це посилання вже додане для відстеження.');
        clearUserState(String(userId));
        // show main menu after duplicate notice
        await ctx.replyWithHTML('Головне меню', { reply_markup: mainMenuKeyboard() } as any);
        return;
    }

    if (userLinks.length >= MAX_LINKS) {
        ctx.reply(`Ви можете додати максимум ${MAX_LINKS} посилань для відстеження. Видаліть одне посилання перед додаванням нового.`);
        return;
    }

    const isValidLink = validateLink(link);
    if (!isValidLink) {
        ctx.reply('Наведене посилання недійсне. Будь ласка, надайте коректне посилання для відстеження.');
        return;
    }

    const created = await addLinkToDatabase(userId, link);
    await ctx.reply(`✅ Посилання додано для відстеження: ${link}`);
    clearUserState(String(userId));
    // show main menu after successful add
    await ctx.replyWithHTML('Головне меню', { reply_markup: mainMenuKeyboard() } as any);
    // notify worker to start tracking this user's links immediately
    try {
        redisClient.publish('trackLinks', JSON.stringify({ userId }));
    } catch (err) {
        console.warn('Failed to publish trackLinks message', err);
    }
    return created;
};

const validateLink = (link: string): boolean => {
    const linkPattern = /^https?:\/\/booking\.uz\.gov\.ua\/search-trips\/\d+\/\d+\/list\?startDate=\d{4}-\d{2}-\d{2}(?:&.*)?$/;
    return linkPattern.test(link);
};