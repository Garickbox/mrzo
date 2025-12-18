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
const userStates = new Map();

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

// Функция для отправки сообщения с автоматическим удалением предыдущего
async function sendMessageWithCleanup(ctx, userId, text, options = {}) {
    // Удаляем предыдущее сообщение бота
    await testManager.cleanupPreviousBotMessage(userId, ctx);
    
    // Отправляем новое сообщение
    const message = await ctx.reply(text, options);
    
    // Сохраняем ID нового сообщения
    testManager.updateBotLastMessage(userId, message.message_id);
    
    return message;
}

// Функция для редактирования сообщения (используется при ответах)
async function editMessageWithCleanup(ctx, userId, messageId, text, options = {}) {
    try {
        await ctx.telegram.editMessageText(ctx.chat.id, messageId, undefined, text, options);
    } catch (error) {
        // Если не удалось редактировать (например, сообщение уже удалено), отправляем новое
        await sendMessageWithCleanup(ctx, userId, text, options);
    }
}

// ==================== КОМАНДЫ ====================
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.split(' ');
    
    // Удаляем сообщение пользователя
    try {
        await ctx.deleteMessage();
    } catch (error) {
        // Игнорируем, если не удалось удалить
    }
    
    if (args.length === 2) {
        const testCode = args[1].toLowerCase();
        await startTestProcess(ctx, userId, testCode);
    } else {
        await sendMessageWithCleanup(ctx, userId, `🎓 *Школьная система тестирования*

Добро пожаловать! Я помогу пройти тесты прямо в Telegram.

📋 *Основные команды:*
/tests - Список доступных тестов
/start [код] - Быстрый старт теста (пример: /start ttii7)
/results - Мои результаты тестов
/help - Помощь и контакты
/cancel - Отменить текущий тест

📱 *Веб-версия:* ${CONFIG.MAIN_WEBSITE}`, { 
            parse_mode: 'Markdown',
            ...Markup.keyboard([
                ['📚 Список тестов', '📊 Мои результаты'],
                ['🚀 Начать тест ttii7', '🆘 Помощь']
            ]).resize()
        });
    }
});

bot.command('cancel', async (ctx) => {
    const userId = ctx.from.id;
    
    // Удаляем сообщение пользователя
    try {
        await ctx.deleteMessage();
    } catch (error) {
        // Игнорируем
    }
    
    const session = testManager.getSession(userId);
    
    if (session) {
        // Очищаем последнее сообщение бота
        await testManager.cleanupPreviousBotMessage(userId, ctx);
        // Удаляем сессию
        testManager.deleteSession(userId);
        userStates.delete(userId);
        
        await sendMessageWithCleanup(ctx, userId, '✅ *Тест отменен.*\n\nВсе сообщения теста удалены.', {
            parse_mode: 'Markdown'
        });
    } else {
        await sendMessageWithCleanup(ctx, userId, '❌ *Нет активного теста для отмены.*', {
            parse_mode: 'Markdown'
        });
    }
});

bot.command('tests', async (ctx) => {
    const userId = ctx.from.id;
    
    // Удаляем сообщение пользователя
    try {
        await ctx.deleteMessage();
    } catch (error) {
        // Игнорируем
    }
    
    const tests = testLoader.getAvailableTests();
    const buttons = tests.map(test => [
        Markup.button.callback(test.title, `start_test:${test.name}`)
    ]);
    
    await sendMessageWithCleanup(ctx, userId, '📚 *Доступные тесты:*\n\nВыберите тест для прохождения:', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
    });
});

bot.command('results', async (ctx) => {
    const userId = ctx.from.id;
    
    // Удаляем сообщение пользователя
    try {
        await ctx.deleteMessage();
    } catch (error) {
        // Игнорируем
    }
    
    const results = await FirebaseService.getUserResults(userId);
    
    if (results.length === 0) {
        await sendMessageWithCleanup(ctx, userId, '📭 *Результатов пока нет*\n\nПройдите тест, чтобы увидеть результаты!', { 
            parse_mode: 'Markdown' 
        });
        return;
    }
    
    let message = '📊 *Ваши результаты:*\n\n';
    results.forEach((result, index) => {
        const date = result.completedAt ? 
            new Date(result.completedAt).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }) : 'Дата не указана';
        
        message += `*${index + 1}. ${escapeMarkdown(result.testName)}*\n`;
        message += `📅 ${date} | 🎯 ${result.grade}/5 | ${result.score}/${result.maxScore} баллов\n`;
        message += `👤 ${escapeMarkdown(result.student.lastName)} ${escapeMarkdown(result.student.firstName)} (${result.student.class} класс)\n`;
        message += `---\n`;
    });
    
    message += `\nВсего тестов: ${results.length}`;
    
    await sendMessageWithCleanup(ctx, userId, message, { parse_mode: 'Markdown' });
});

bot.command('help', async (ctx) => {
    const userId = ctx.from.id;
    
    // Удаляем сообщение пользователя
    try {
        await ctx.deleteMessage();
    } catch (error) {
        // Игнорируем
    }
    
    await sendMessageWithCleanup(ctx, userId, `🆘 *Помощь и поддержка*

📞 *Контакты разработчика:* @garickbox
🌐 *Официальный сайт:* ${CONFIG.MAIN_WEBSITE}

*Частые вопросы:*

1. *Не могу начать тест*
   - Проверьте правильность ввода Фамилии и Имени
   - Убедитесь, что правильно указан класс (7-11)

2. *Не загружается тест*
   - Проверьте интернет соединение
   - Попробуйте позже или выберите другой тест

3. *Ошибка при отправке ответа*
   - Попробуйте перезапустить бот командой /start
   - Если не помогает, обратитесь к разработчику

*Техническая поддержка доступна в рабочее время (Пн-Пт, 9:00-18:00)*`, {
        parse_mode: 'Markdown'
    });
});

bot.command('status', async (ctx) => {
    const userId = ctx.from.id;
    
    // Удаляем сообщение пользователя
    try {
        await ctx.deleteMessage();
    } catch (error) {
        // Игнорируем
    }
    
    if (ctx.from.id.toString() !== CONFIG.ADMIN_TELEGRAM_ID) {
        await sendMessageWithCleanup(ctx, userId, '⚠️ Эта команда доступна только администратору');
        return;
    }
    
    const status = {
        bot: '🟢 Активен',
        firebase: initializeFirebase() ? '🟢 Подключен' : '🔴 Отключен',
        sessions: testManager.userSessions.size,
        cache: testLoader.cache.size
    };
    
    await sendMessageWithCleanup(ctx, userId, `*Статус системы:*\n\n🤖 Бот: ${status.bot}\n🔥 Firebase: ${status.firebase}\n📊 Активных сессий: ${status.sessions}\n💾 Кэш тестов: ${status.cache}`, {
        parse_mode: 'Markdown'
    });
});

// ==================== INLINE КНОПКИ ====================
bot.action('show_tests', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        await ctx.deleteMessage();
    } catch (error) {
        // Игнорируем ошибку удаления
    }
    
    const tests = testLoader.getAvailableTests();
    const buttons = tests.map(test => [
        Markup.button.callback(test.title, `start_test:${test.name}`)
    ]);
    
    await sendMessageWithCleanup(ctx, userId, '📚 *Выберите тест:*\n\nНажмите на название теста для начала:', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
    });
});

bot.action(/start_test:(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const testCode = ctx.match[1];
    
    try {
        await ctx.deleteMessage();
    } catch (error) {
        // Игнорируем ошибку удаления
    }
    
    await startTestProcess(ctx, userId, testCode);
});

bot.action(/select_student:(\d+)/, async (ctx) => {
    const studentId = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    try {
        await ctx.deleteMessage();
    } catch (error) {
        // Игнорируем ошибку удаления
    }
    
    const student = STUDENTS_DB.getStudentById(studentId);
    if (!student) {
        await sendMessageWithCleanup(ctx, userId, '❌ Ученик не найден в базе данных');
        return;
    }
    
    userStates.set(userId, { 
        step: 'test_ready', 
        student,
        testCode: userStates.get(userId)?.testCode 
    });
    
    await sendMessageWithCleanup(ctx, userId, `✅ *Идентификация успешна!*

👤 *Ученик:* ${escapeMarkdown(student.lastName)} ${escapeMarkdown(student.firstName)}
🏫 *Класс:* ${student.class}

Теперь вы можете начать тест. Нажмите кнопку ниже:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Начать тест', 'begin_test')],
            [Markup.button.callback('🔄 Выбрать другого', 'change_student')]
        ])
    });
});

bot.action('begin_test', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        await ctx.deleteMessage();
    } catch (error) {
        // Игнорируем ошибку удаления
    }
    
    const state = userStates.get(userId);
    
    if (!state || !state.student || !state.testCode) {
        await sendMessageWithCleanup(ctx, userId, '❌ Ошибка: данные сессии утеряны. Пожалуйста, начните заново с команды /tests');
        return;
    }
    
    try {
        const testData = await testLoader.loadTest(state.testCode);
        const session = testManager.createTestSession(userId, testData, state.student);
        await showQuestion(ctx, session);
    } catch (error) {
        await sendMessageWithCleanup(ctx, userId, `❌ Ошибка загрузки теста: ${error.message}\n\nПопробуйте другой тест или обратитесь в поддержку.`);
    }
});

bot.action('change_student', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        await ctx.deleteMessage();
    } catch (error) {
        // Игнорируем ошибку удаления
    }
    
    const state = userStates.get(userId);
    
    if (state && state.testCode) {
        await showStudentSearch(ctx, userId, state.testCode);
    } else {
        await sendMessageWithCleanup(ctx, userId, '❌ Ошибка: данные утеряны. Используйте команду /tests для выбора теста.');
    }
});

bot.action(/answer:(\d+)/, async (ctx) => {
    const answerIndex = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    const messageId = ctx.callbackQuery.message.message_id;
    
    const result = testManager.answerQuestion(userId, answerIndex);
    if (!result) {
        await sendMessageWithCleanup(ctx, userId, '❌ Сессия теста не найдена или тест уже завершен');
        return;
    }
    
    const { session, isCorrect, isCompleted } = result;
    
    // Обновляем текущее сообщение с результатом ответа
    await editMessageWithCleanup(ctx, userId, messageId,
        `✅ *Ответ принят!*\n\n${isCorrect ? '✅ Правильно! (+' + session.allQuestions[session.currentQuestionIndex - 1].points + ' балл)' : '❌ Неправильно'}\n${isCompleted ? '\n⏳ *Подсчитываем результаты...*' : ''}`,
        { parse_mode: 'Markdown' }
    );
    
    if (isCompleted) {
        // Для завершенного теста не удаляем сообщение с результатом ответа
        // сразу переходим к показу итогов
        setTimeout(() => finishTest(ctx, session), 1500);
    } else {
        // Для продолжения теста удаляем сообщение с результатом ответа через 1.5 секунды
        // и показываем следующий вопрос
        setTimeout(async () => {
            await testManager.cleanupPreviousBotMessage(userId, ctx);
            setTimeout(() => showQuestion(ctx, session), 500);
        }, 1500);
    }
});

bot.action('show_my_results', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        await ctx.deleteMessage();
    } catch (error) {
        // Игнорируем ошибку удаления
    }
    
    const results = await FirebaseService.getUserResults(userId);
    
    if (results.length === 0) {
        await sendMessageWithCleanup(ctx, userId, '📭 *Результатов пока нет*\n\nПройдите тест, чтобы увидеть результаты!', { 
            parse_mode: 'Markdown' 
        });
        return;
    }
    
    let message = '📊 *Ваши результаты:*\n\n';
    results.forEach((result, index) => {
        const date = result.completedAt ? 
            new Date(result.completedAt).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }) : 'Дата не указана';
        
        message += `*${index + 1}. ${escapeMarkdown(result.testName)}*\n`;
        message += `📅 ${date} | 🎯 ${result.grade}/5 | ${result.score}/${result.maxScore} баллов\n`;
        message += `👤 ${escapeMarkdown(result.student.lastName)} ${escapeMarkdown(result.student.firstName)}\n`;
        message += `---\n`;
    });
    
    await sendMessageWithCleanup(ctx, userId, message, { parse_mode: 'Markdown' });
});

// ==================== ОБРАБОТКА ТЕКСТА ====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const text = ctx.message.text;
    
    // Сохраняем ID сообщения пользователя для возможного удаления
    testManager.updateUserLastMessage(userId, ctx.message.message_id);
    
    // Обработка кнопок клавиатуры
    if (text === '🚀 Начать тест ttii7') {
        // Удаляем сообщение пользователя
        try {
            await ctx.deleteMessage();
        } catch (error) {
            // Игнорируем
        }
        
        await startTestProcess(ctx, userId, 'ttii7');
        return;
    }
    
    if (text === '📚 Список тестов') {
        // Удаляем сообщение пользователя
        try {
            await ctx.deleteMessage();
        } catch (error) {
            // Игнорируем
        }
        
        const tests = testLoader.getAvailableTests();
        const buttons = tests.map(test => [
            Markup.button.callback(test.title, `start_test:${test.name}`)
        ]);
        
        await sendMessageWithCleanup(ctx, userId, '📚 *Доступные тесты:*\n\nВыберите тест для прохождения:', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
        return;
    }
    
    if (text === '📊 Мои результаты') {
        // Удаляем сообщение пользователя
        try {
            await ctx.deleteMessage();
        } catch (error) {
            // Игнорируем
        }
        
        const results = await FirebaseService.getUserResults(userId);
        
        if (results.length === 0) {
            await sendMessageWithCleanup(ctx, userId, '📭 *Результатов пока нет*\n\nПройдите тест, чтобы увидеть результаты!', { 
                parse_mode: 'Markdown' 
            });
            return;
        }
        
        let message = '📊 *Ваши результаты:*\n\n';
        results.forEach((result, index) => {
            const date = result.completedAt ? 
                new Date(result.completedAt).toLocaleDateString('ru-RU') : 
                'Дата не указана';
            
            message += `*${index + 1}. ${escapeMarkdown(result.testName)}*\n`;
            message += `📅 ${date} | 🎯 ${result.grade}/5 | ${result.score}/${result.maxScore} баллов\n`;
            message += `👤 ${escapeMarkdown(result.student.lastName)} ${escapeMarkdown(result.student.firstName)}\n`;
            message += `---\n`;
        });
        
        await sendMessageWithCleanup(ctx, userId, message, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🆘 Помощь') {
        // Удаляем сообщение пользователя
        try {
            await ctx.deleteMessage();
        } catch (error) {
            // Игнорируем
        }
        
        await sendMessageWithCleanup(ctx, userId, `🆘 *Помощь и поддержка*\n\n📞 Контакты: @garickbox\n🌐 Сайт: ${CONFIG.MAIN_WEBSITE}`, {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    // Обработка ввода данных ученика
    if (state && state.step === 'awaiting_student') {
        // Удаляем сообщение пользователя после обработки
        setTimeout(async () => {
            try {
                await ctx.deleteMessage();
            } catch (error) {
                // Игнорируем
            }
        }, 500);
        
        const parts = text.trim().split(/\s+/);
        
        if (parts.length >= 2) {
            const lastName = parts[0];
            const firstName = parts[1];
            const className = parts[2] || '';
            
            // Валидация класса
            if (className && !['7','8','9','10','11'].includes(className)) {
                await sendMessageWithCleanup(ctx, userId, '❌ Класс должен быть числом от 7 до 11\n\nВведите: Фамилия Имя [Класс]');
                return;
            }
            
            const results = STUDENTS_DB.searchStudents(lastName, firstName, className);
            
            if (results.length > 0) {
                // Ограничиваем до 3 лучших результатов
                const buttons = results.slice(0, 3).map(result => [
                    Markup.button.callback(
                        `${result.student.lastName} ${result.student.firstName} (${result.student.class} класс)`,
                        `select_student:${result.student.id}`
                    )
                ]);
                
                // Добавляем кнопку для повторного ввода
                buttons.push([Markup.button.callback('🔄 Ввести заново', 'change_student')]);
                
                await sendMessageWithCleanup(ctx, userId, `🔍 *Найдены ученики:*\n\nВыберите ваше имя из списка:`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(buttons)
                });
            } else {
                await sendMessageWithCleanup(ctx, userId, '❌ *Ученик не найден*\n\nПроверьте:\n1. Правильность Фамилии и Имени\n2. Укажите класс (7-11)\n3. Попробуйте еще раз\n\nПример: `Иванов Иван 7`', {
                    parse_mode: 'Markdown'
                });
            }
        } else {
            await sendMessageWithCleanup(ctx, userId, '❌ *Неверный формат*\n\nВведите: `Фамилия Имя [Класс]`\n\nПримеры:\n`Иванов Иван 7`\n`Петрова Анна` (если не знаете класс)', {
                parse_mode: 'Markdown'
            });
        }
    } else {
        // Для любых других текстовых сообщений удаляем их и показываем меню
        try {
            await ctx.deleteMessage();
        } catch (error) {
            // Игнорируем
        }
        
        await sendMessageWithCleanup(ctx, userId, `📌 *Используйте меню или команды:*\n\n/tests - Список тестов\n/results - Мои результаты\n/help - Помощь`, {
            parse_mode: 'Markdown'
        });
    }
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
async function startTestProcess(ctx, userId, testCode) {
    try {
        // Проверяем существование теста
        const tests = testLoader.getAvailableTests();
        const testExists = tests.some(test => test.name === testCode);
        
        if (!testExists) {
            await sendMessageWithCleanup(ctx, userId, `❌ Тест "${testCode}" не найден\n\nИспользуйте /tests для списка доступных тестов`, {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        userStates.set(userId, { 
            step: 'awaiting_student', 
            testCode 
        });
        
        await sendMessageWithCleanup(ctx, userId, '👤 *Идентификация ученика*\n\nВведите ваши данные в формате:\n`Фамилия Имя [Класс]`\n\n*Примеры:*\n`Иванов Иван 7`\n`Петрова Анна` (если не знаете класс)\n\n_Класс указывать необязательно, но это ускорит поиск_', {
            parse_mode: 'Markdown',
            ...Markup.removeKeyboard()
        });
    } catch (error) {
        console.error('Ошибка начала теста:', error);
        await sendMessageWithCleanup(ctx, userId, `❌ *Ошибка:* ${error.message}\n\nПопробуйте позже или используйте /tests для выбора теста`, {
            parse_mode: 'Markdown'
        });
    }
}

async function showStudentSearch(ctx, userId, testCode) {
    userStates.set(userId, { 
        step: 'awaiting_student', 
        testCode 
    });
    
    await sendMessageWithCleanup(ctx, userId, '👤 *Введите данные заново:*\n`Фамилия Имя [Класс]`\n\nПример: `Иванов Иван 7`', {
        parse_mode: 'Markdown'
    });
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
        
        await sendMessageWithCleanup(ctx, session.userId, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    } catch (error) {
        console.error('Ошибка показа вопроса:', error);
        await sendMessageWithCleanup(ctx, session.userId, '❌ Произошла ошибка при загрузке вопроса. Пожалуйста, начните тест заново.');
        testManager.deleteSession(ctx.from.id);
        userStates.delete(ctx.from.id);
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
        
        // Для финального результата НЕ удаляем предыдущее сообщение (чтобы показать переход)
        // Отправляем как новое сообщение
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📚 Пройти другой тест', 'show_tests')],
                [Markup.button.callback('📊 Мои результаты', 'show_my_results')]
            ])
        });
        
        // Очищаем сессии
        testManager.deleteSession(ctx.from.id);
        userStates.delete(ctx.from.id);
        
    } catch (error) {
        console.error('Ошибка завершения теста:', error);
        await sendMessageWithCleanup(ctx, session.userId, '❌ Произошла ошибка при сохранении результатов. Пожалуйста, свяжитесь с администратором.');
    }
}

// ==================== ОБРАБОТКА ОШИБОК ====================
bot.catch((err, ctx) => {
    console.error(`Ошибка для пользователя ${ctx.from?.id}:`, err);
    sendMessageWithCleanup(ctx, ctx.from.id, '❌ Произошла непредвиденная ошибка. Пожалуйста, попробуйте позже или обратитесь к администратору @garickbox');
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
        console.log('📊 Панель администратора: https://core.telegram.org/bots#botfather');
        
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