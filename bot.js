const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const { CONFIG, TestLoader, TestManager, FirebaseService, initializeFirebase } = require('./services');
const STUDENTS_DB = require('./students');

// Используем токен из .env или из CONFIG
const botToken = process.env.BOT_TOKEN || CONFIG.BOT_TOKEN;

if (!botToken) {
    console.error('❌ Ошибка: BOT_TOKEN не найден!');
    console.error('💡 Создайте файл .env с BOT_TOKEN=ваш_токен');
    process.exit(1);
}

const bot = new Telegraf(botToken);
const testLoader = new TestLoader();
const testManager = new TestManager();

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function formatDuration(minutes) {
    if (minutes < 1) return 'менее минуты';
    if (minutes === 1) return '1 минута';
    if (minutes < 5) return `${minutes} минуты`;
    return `${minutes} минут`;
}

function escapeMarkdown(text) {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Функция для отправки сообщения с автоматическим удалением предыдущего активного
async function sendMessageWithCleanup(ctx, userId, text, options = {}, addToChain = true) {
    // Удаляем предыдущее активное сообщение
    await testManager.deleteActiveMessage(userId, ctx);
    
    // Отправляем новое сообщение
    const message = await ctx.reply(text, options);
    
    // Сохраняем как активное
    testManager.setActiveMessage(userId, message.message_id);
    
    // Добавляем в цепочку если нужно
    if (addToChain) {
        testManager.addToMessageChain(userId, message.message_id);
    }
    
    return message;
}

// Функция для отправки временного сообщения (удаляется через 3 секунды)
async function sendTempMessage(ctx, userId, text, options = {}) {
    const message = await ctx.reply(text, options);
    
    // Удаляем через 3 секунды
    setTimeout(async () => {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, message.message_id);
        } catch (error) {
            // Игнорируем ошибки удаления
        }
    }, 3000);
    
    return message;
}

// Удаляем сообщение пользователя
async function deleteUserMessage(ctx, userId) {
    try {
        await ctx.deleteMessage();
        // Добавляем в цепочку для последующей очистки
        testManager.addToMessageChain(userId, ctx.message.message_id);
    } catch (error) {
        // Игнорируем ошибки удаления
    }
}

// ==================== КОМАНДЫ ====================
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    
    // Удаляем сообщение пользователя
    await deleteUserMessage(ctx, userId);
    
    // Проверяем, есть ли сохраненный ученик
    const savedStudent = testManager.getStudent(userId);
    
    if (savedStudent) {
        // Пользователь уже авторизован - показываем меню
        await showMainMenu(ctx, userId, savedStudent);
    } else {
        // Пользователь не авторизован - начинаем новую цепочку
        testManager.startMessageChain(userId, ctx.message.message_id);
        await requestStudentAuth(ctx, userId);
    }
});

bot.command('help', async (ctx) => {
    const userId = ctx.from.id;
    
    // Удаляем сообщение пользователя
    await deleteUserMessage(ctx, userId);
    
    await sendMessageWithCleanup(ctx, userId, `🆘 *Помощь и поддержка*

📞 *Контакты разработчика:* @garickbox
🌐 *Официальный сайт:* ${CONFIG.MAIN_WEBSITE}

*Основные команды:*
/start - Главное меню
/help - Эта справка
/cancel - Отменить текущий тест

*Процесс тестирования:*
1. Выберите "Начать тест"
2. Пришлите код теста (например: ttii7)
3. Пройдите вопросы теста (используйте кнопки под сообщением)
4. Получите результат

*Если возникли проблемы:*
- Проверьте правильность ввода кода теста
- Убедитесь в стабильности интернет-соединения
- Используйте кнопки для ответов, не пишите текст
- При необходимости свяжитесь с разработчиком`, {
        parse_mode: 'Markdown',
        ...Markup.removeKeyboard()
    });
});

bot.command('cancel', async (ctx) => {
    const userId = ctx.from.id;
    
    // Удаляем сообщение пользователя
    await deleteUserMessage(ctx, userId);
    
    const session = testManager.getSession(userId);
    
    if (session) {
        // Очищаем цепочку сообщений теста
        await testManager.cleanupMessageChain(userId, ctx);
        // Удаляем текущий вопрос если есть
        await testManager.deleteCurrentQuestionMessage(userId, ctx);
        // Удаляем активное сообщение
        await testManager.deleteActiveMessage(userId, ctx);
        // Удаляем сессию
        testManager.deleteSession(userId);
        
        await sendTempMessage(ctx, userId, '✅ *Тест отменен.*\n\nВсе сообщения теста удалены.', {
            parse_mode: 'Markdown'
        });
        
        // Показываем главное меню
        const savedStudent = testManager.getStudent(userId);
        if (savedStudent) {
            await showMainMenu(ctx, userId, savedStudent);
        } else {
            await requestStudentAuth(ctx, userId);
        }
    } else {
        await sendTempMessage(ctx, userId, '❌ *Нет активного теста для отмены.*', {
            parse_mode: 'Markdown'
        });
    }
});

// ==================== ОБРАБОТКА ТЕКСТА ====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    
    // Проверяем разные состояния
    const savedStudent = testManager.getStudent(userId);
    const session = testManager.getSession(userId);
    
    // Если есть активный тест
    if (session) {
        // Удаляем сообщение пользователя
        await deleteUserMessage(ctx, userId);
        
        // Отправляем временное напоминание об использовании кнопок
        await sendTempMessage(ctx, userId, '⚠️ *Используйте кнопки для ответа!*\n\nДля отмены теста используйте /cancel', {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    // Обработка кнопок меню
    if (text === '🚀 Начать тест') {
        await deleteUserMessage(ctx, userId);
        
        if (!savedStudent) {
            await sendMessageWithCleanup(ctx, userId, '❌ *Сначала нужно авторизоваться!*\n\nНажмите /start для начала.', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        await requestTestCode(ctx, userId);
        return;
    }
    
    if (text === '🆘 Помощь') {
        await deleteUserMessage(ctx, userId);
        await sendMessageWithCleanup(ctx, userId, `📞 *Контакты поддержки:* @garickbox\n🌐 *Сайт:* ${CONFIG.MAIN_WEBSITE}\n\nДля отмены теста: /cancel`, {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    if (text === '👤 Сменить пользователя') {
        await deleteUserMessage(ctx, userId);
        
        // Удаляем сохраненного ученика
        testManager.removeStudent(userId);
        // Очищаем цепочку
        await testManager.cleanupMessageChain(userId, ctx);
        // Удаляем активное сообщение
        await testManager.deleteActiveMessage(userId, ctx);
        
        // Начинаем новую цепочку авторизации
        testManager.startMessageChain(userId, ctx.message.message_id);
        await requestStudentAuth(ctx, userId);
        return;
    }
    
    // Обработка ввода кода теста
    if (text.startsWith('ttii') || text === 'test') {
        await processTestCode(ctx, userId, text, savedStudent);
        return;
    }
    
    // Обработка авторизации (если пользователь еще не авторизован)
    if (!savedStudent) {
        await processStudentAuth(ctx, userId, text);
        return;
    }
    
    // Если ничего не подошло - показываем меню
    await deleteUserMessage(ctx, userId);
    await showMainMenu(ctx, userId, savedStudent);
});

// ==================== INLINE КНОПКИ (для теста) ====================
bot.action(/answer:(\d+)/, async (ctx) => {
    const answerIndex = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    const messageId = ctx.callbackQuery.message.message_id;
    
    const result = testManager.answerQuestion(userId, answerIndex);
    if (!result) {
        await ctx.answerCbQuery('❌ Сессия теста не найдена');
        return;
    }
    
    const { session, isCorrect, isCompleted } = result;
    
    // Удаляем текущий вопрос
    await testManager.deleteCurrentQuestionMessage(userId, ctx);
    
    // Показываем результат ответа
    const resultMessage = await ctx.reply(
        `✅ *Ответ принят!*\n\n${isCorrect ? '✅ Правильно!' : '❌ Неправильно'}\n${isCompleted ? '\n⏳ *Подсчитываем результаты...*' : ''}`,
        { parse_mode: 'Markdown' }
    );
    
    // Добавляем результат в цепочку
    testManager.addToMessageChain(userId, resultMessage.message_id);
    
    if (isCompleted) {
        // Удаляем результат через 2 секунды и завершаем тест
        setTimeout(async () => {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, resultMessage.message_id);
            } catch (error) {
                // Игнорируем
            }
            setTimeout(() => finishTest(ctx, session), 500);
        }, 2000);
    } else {
        // Удаляем результат через 2 секунды и показываем следующий вопрос
        setTimeout(async () => {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, resultMessage.message_id);
            } catch (error) {
                // Игнорируем
            }
            setTimeout(() => showQuestion(ctx, session), 500);
        }, 2000);
    }
    
    // Подтверждаем нажатие кнопки
    await ctx.answerCbQuery();
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
async function showMainMenu(ctx, userId, student) {
    await sendMessageWithCleanup(ctx, userId, `👋 *Привет, ${escapeMarkdown(student.firstName)} ${escapeMarkdown(student.lastName)}!*

🏫 *Класс:* ${student.class}
🆔 *ID:* ${student.id}

Выберите действие:`, {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
            ['🚀 Начать тест', '🆘 Помощь'],
            ['👤 Сменить пользователя']
        ]).resize()
    });
}

async function requestStudentAuth(ctx, userId) {
    await sendMessageWithCleanup(ctx, userId, '👤 *Авторизация ученика*\n\nВведите ваши данные в формате:\n`Фамилия Имя Класс`\n\n*Пример:*\n`Иванов Иван 7`\n\n_Класс указывать обязательно (7-11)_', {
        parse_mode: 'Markdown',
        ...Markup.removeKeyboard()
    });
}

async function processStudentAuth(ctx, userId, text) {
    const parts = text.trim().split(/\s+/);
    
    if (parts.length >= 3) {
        const lastName = parts[0];
        const firstName = parts[1];
        const className = parts[2];
        
        // Валидация класса
        if (!['7','8','9','10','11'].includes(className)) {
            await sendMessageWithCleanup(ctx, userId, '❌ *Класс должен быть числом от 7 до 11*\n\nПопробуйте еще раз:', {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        const results = STUDENTS_DB.searchStudents(lastName, firstName, className);
        
        if (results.length > 0) {
            // Берем лучший результат
            const bestMatch = results[0];
            const student = bestMatch.student;
            
            // Сохраняем ученика
            testManager.saveStudent(userId, student);
            
            // Удаляем сообщение пользователя с ФИО
            await deleteUserMessage(ctx, userId);
            
            // Показываем главное меню
            await showMainMenu(ctx, userId, student);
        } else {
            await sendMessageWithCleanup(ctx, userId, '❌ *Ученик не найден*\n\nПроверьте:\n1. Правильность Фамилии и Имени\n2. Правильность класса (7-11)\n3. Попробуйте еще раз\n\nПример: `Иванов Иван 7`', {
                parse_mode: 'Markdown'
            });
        }
    } else {
        await sendMessageWithCleanup(ctx, userId, '❌ *Неверный формат*\n\nВведите: `Фамилия Имя Класс`\n\nПример: `Иванов Иван 7`', {
            parse_mode: 'Markdown'
        });
    }
}

async function requestTestCode(ctx, userId) {
    await sendMessageWithCleanup(ctx, userId, '📝 *Введите код теста*\n\n*Доступные тесты:*\n• `ttii7` - Компьютер — универсальное устройство (7 класс)\n• `test` - Основной тест\n\nПросто отправьте код теста:', {
        parse_mode: 'Markdown',
        ...Markup.removeKeyboard()
    });
}

async function processTestCode(ctx, userId, testCode, student) {
    // Удаляем сообщение пользователя с кодом теста
    await deleteUserMessage(ctx, userId);
    
    try {
        // Проверяем существование теста
        const tests = testLoader.getAvailableTests();
        const testExists = tests.some(test => test.name === testCode);
        
        if (!testExists) {
            await sendMessageWithCleanup(ctx, userId, `❌ *Тест "${testCode}" не найден*\n\n*Доступные тесты:*\n• ttii7\n• test\n\nИспользуйте кнопку "Начать тест" для выбора теста.`, {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        // Загружаем тест
        const testData = await testLoader.loadTest(testCode);
        
        // Создаем сессию теста
        const session = testManager.createTestSession(userId, testData, student);
        
        // Начинаем новую цепочку сообщений для теста
        testManager.startMessageChain(userId, ctx.message.message_id);
        
        // Показываем первый вопрос
        await showQuestion(ctx, session);
        
    } catch (error) {
        console.error('Ошибка начала теста:', error);
        await sendMessageWithCleanup(ctx, userId, `❌ *Ошибка:* ${error.message}\n\nПопробуйте другой тест или обратитесь в поддержку.`, {
            parse_mode: 'Markdown'
        });
    }
}

async function showQuestion(ctx, session) {
    try {
        const question = session.allQuestions[session.currentQuestionIndex];
        const questionNumber = session.currentQuestionIndex + 1;
        const totalQuestions = session.allQuestions.length;
        
        const buttons = question.options.map((option, index) => [
            Markup.button.callback(`${String.fromCharCode(65 + index)}. ${option.t}`, `answer:${index}`)
        ]);
        
        // Добавляем информацию о баллах
        const pointsInfo = question.points === 3 ? '📐 *Задача (3 балла)*' : '📖 *Вопрос (1 балл)*';
        
        const message = `${pointsInfo}
📝 *Вопрос ${questionNumber}/${totalQuestions}*

${question.text}

*Выберите правильный ответ:*`;
        
        const questionMessage = await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
        
        // Сохраняем ID сообщения с вопросом
        testManager.setCurrentQuestionMessageId(session.userId, questionMessage.message_id);
        testManager.addToMessageChain(session.userId, questionMessage.message_id);
        
    } catch (error) {
        console.error('Ошибка показа вопроса:', error);
        await sendMessageWithCleanup(ctx, session.userId, '❌ Произошла ошибка при загрузке вопроса. Пожалуйста, начните тест заново.');
        testManager.deleteSession(ctx.from.id);
    }
}

async function finishTest(ctx, session) {
    try {
        const result = {
            student: session.student,
            testName: session.testTitle,
            testCode: session.testName,
            score: session.score,
            maxScore: session.maxScore,
            grade: session.grade,
            correctQuestions: session.correctQuestions,
            correctProblems: session.correctProblems,
            answers: session.userAnswers,
            duration: Math.floor((session.endTime - session.startTime) / 1000)
        };
        
        // Сохраняем результат
        await FirebaseService.saveTestResult(ctx.from.id, session, result);
        
        // Отправляем в Telegram (если настроено)
        await testManager.sendResultsToTelegram(session);
        
        // Формируем сообщение с результатом
        const durationFormatted = formatDuration(Math.floor(result.duration / 60));
        const percentage = Math.round((session.score / session.maxScore) * 100);
        
        let rating = '';
        if (session.grade >= 4) rating = '🏆 *Отличный результат!*';
        else if (session.grade === 3) rating = '👍 *Хорошая работа!*';
        else rating = '💪 *Есть над чем поработать!*';
        
        const message = `🎉 *Тест завершен!*

📊 *Ваши результаты:*
👤 Ученик: ${escapeMarkdown(session.student.lastName)} ${escapeMarkdown(session.student.firstName)}
🏫 Класс: ${session.student.class}
⏱️ Время: ${durationFormatted}
🎯 Баллы: ${session.score}/${session.maxScore} (${percentage}%)
📈 Оценка: ${session.grade}/5

📖 Правильных вопросов: ${session.correctQuestions}
📐 Правильных задач: ${session.correctProblems}

${rating}

Результат сохранен в системе.`;
        
        // Очищаем ВСЕ сообщения теста (включая активное сообщение)
        await testManager.cleanupMessageChain(ctx.from.id, ctx);
        await testManager.deleteActiveMessage(ctx.from.id, ctx);
        
        // Очищаем сессию
        testManager.deleteSession(ctx.from.id);
        
        // Отправляем результат (НЕ добавляем в цепочку для удаления)
        const finalMessage = await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.removeKeyboard()
        });
        
        // Сохраняем финальное сообщение как активное
        testManager.setActiveMessage(ctx.from.id, finalMessage.message_id);
        
        // Показываем главное меню через 5 секунды
        setTimeout(async () => {
            const savedStudent = testManager.getStudent(ctx.from.id);
            if (savedStudent) {
                await showMainMenu(ctx, ctx.from.id, savedStudent);
            }
        }, 5000);
        
    } catch (error) {
        console.error('Ошибка завершения теста:', error);
        await sendMessageWithCleanup(ctx, session.userId, '❌ Произошла ошибка при сохранении результатов. Пожалуйста, свяжитесь с администратором.');
    }
}

// ==================== ОБРАБОТКА ОШИБОК ====================
bot.catch((err, ctx) => {
    console.error(`Ошибка для пользователя ${ctx.from?.id}:`, err);
    
    try {
        ctx.reply('❌ Произошла непредвиденная ошибка. Пожалуйста, попробуйте позже или обратитесь к администратору @garickbox');
    } catch (e) {
        console.error('Не удалось отправить сообщение об ошибке:', e);
    }
});

// ==================== ЗАПУСК ====================
async function startBot() {
    try {
        console.log('🚀 Запуск школьного бота тестирования...');
        
        // Проверяем Firebase
        if (initializeFirebase()) {
            console.log('✅ Firebase готов к работе');
        } else {
            console.warn('⚠️ Firebase не подключен. Результаты не будут сохраняться.');
        }
        
        // Запускаем бота
        await bot.launch();
        
        console.log('🤖 Бот успешно запущен!');
        console.log('👤 Бот доступен как:', bot.botInfo.username);
        console.log('🔗 Ссылка на бота:', `https://t.me/${bot.botInfo.username}`);
        
    } catch (error) {
        console.error('❌ Критическая ошибка запуска бота:', error.message);
        console.error('💡 Проверьте:');
        console.error('1. Правильность BOT_TOKEN в .env файле');
        console.error('2. Интернет соединение');
        console.error('3. Доступ к Telegram API');
        process.exit(1);
    }
}

// ==================== ОБРАБОТКА ЗАВЕРШЕНИЯ ====================
process.once('SIGINT', () => {
    console.log('🛑 Остановка бота (SIGINT)...');
    bot.stop('SIGINT');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Остановка бота (SIGTERM)...');
    bot.stop('SIGTERM');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Неперехваченное исключение:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Необработанный промис:', reason);
});

// Запуск бота
startBot();