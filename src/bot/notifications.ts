import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

// Надсилання повідомлення користувачу з яскравим форматом та емодзі
export const sendNotification = async (userId: number | string, message: string): Promise<void> => {
    const formatted = `🚨 <b>Квитки знайдено!</b> 🚨\n${message}\n\nПеревірте сайт якнайшвидше!`;
    await bot.telegram.sendMessage(Number(userId), formatted, { parse_mode: 'HTML' });
};