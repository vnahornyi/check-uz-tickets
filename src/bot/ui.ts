import { InlineKeyboardButton } from 'telegraf/typings/core/types/typegram';

export const mainMenuKeyboard = () => ({
  inline_keyboard: [
    [
      { text: '➕ Додати посилання', callback_data: 'menu:add' },
      { text: '📋 Список посилань', callback_data: 'menu:list' }
    ],
    [
      { text: '❓ Допомога', callback_data: 'menu:help' }
    ]
  ]
});

export const backToMainButton = () => ({
  inline_keyboard: [[{ text: '🏠 На головну', callback_data: 'menu:main' }]]
});
