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

// ==================== КОМАНДЫ ====================
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.split(' ');
    
    if (args.length === 2) {
        const testCode = args[1].toLowerCase();
        await startTestProcess(ctx, userId, testCode);
    } else {
        await ctx.reply(`🎓 *Школьная система тестирования*

Добро пожаловать! Я помогу пройти тесты прямо в Telegram.

📋 *Основные команды:*
/tests - Список доступных тестов
/start [код] - Быстрый старт теста (пример: /start ttii7)
/results - Мои результаты тестов
/help - Помощь и контакты

📱 *Веб-версия:* ${CONFIG.MAIN_WEBSITE}`, { 
            parse_mode: 'Markdown',
            ...Markup.keyboard([
                ['📚 Список тестов', '📊 Мои результаты'],
                ['🚀 Начать тест ttii7', '🆘 Помощь']
            ]).resize()
        });
    }
});

bot.command('tests', async (ctx) => {
    const tests = testLoader.getAvailableTests();
    const buttons = tests.map(test => [
        Markup.button.callback(test.title, `start_test:${test.name}`)
    ]);
    
    await ctx.reply('📚 *Доступные тесты:*\n\nВыберите тест для прохождения:', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
    });
});

bot.command('results', async (ctx) => {
    const userId = ctx.from.id;
    const results = await FirebaseService.getUserResults(userId);
    
    if (results.length === 0) {
        await ctx.reply('📭 *Результатов пока нет*\n\nПройдите тест, чтобы увидеть результаты!', { 
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
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('help', async (ctx) => {
    await ctx.reply(`🆘 *Помощь и поддержка*

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
    if (ctx.from.id.toString() !== CONFIG.ADMIN_TELEGRAM_ID) {
        await ctx.reply('⚠️ Эта команда доступна только администратору');
        return;
    }
    
    const status = {
        bot: '🟢 Активен',
        firebase: initializeFirebase() ? '🟢 Подключен' : '🔴 Отключен',
        sessions: testManager.userSessions.size,
        cache: testLoader.cache.size
    };
    
    await ctx.reply(`*Статус системы:*\n\n🤖 Бот: ${status.bot}\n🔥 Firebase: ${status.firebase}\n📊 Активных сессий: ${status.sessions}\n💾 Кэш тестов: ${status.cache}`, {
        parse_mode: 'Markdown'
    });
});

// ==================== INLINE КНОПКИ ====================
bot.action('show_tests', async (ctx) => {
    await ctx.deleteMessage();
    const tests = testLoader.getAvailableTests();
    const buttons = tests.map(test => [
        Markup.button.callback(test.title, `start_test:${test.name}`)
    ]);
    
    await ctx.reply('📚 *Выберите тест:*\n\nНажмите на название теста для начала:', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
    });
});

bot.action(/start_test:(.+)/, async (ctx) => {
    const testCode = ctx.match[1];
    await ctx.deleteMessage();
    await startTestProcess(ctx, ctx.from.id, testCode);
});

bot.action(/select_student:(\d+)/, async (ctx) => {
    const studentId = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    const student = STUDENTS_DB.getStudentById(studentId);
    if (!student) {
        await ctx.reply('❌ Ученик не найден в базе данных');
        return;
    }
    
    userStates.set(userId, { 
        step: 'test_ready', 
        student,
        testCode: userStates.get(userId)?.testCode 
    });
    
    await ctx.editMessageText(`✅ *Идентификация успешна!*

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
    await ctx.deleteMessage();
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    
    if (!state || !state.student || !state.testCode) {
        await ctx.reply('❌ Ошибка: данные сессии утеряны. Пожалуйста, начните заново с команды /tests');
        return;
    }
    
    try {
        const testData = await testLoader.loadTest(state.testCode);
        const session = testManager.createTestSession(userId, testData, state.student);
        await showQuestion(ctx, session);
    } catch (error) {
        await ctx.reply(`❌ Ошибка загрузки теста: ${error.message}\n\nПопробуйте другой тест или обратитесь в поддержку.`);
    }
});

bot.action('change_student', async (ctx) => {
    await ctx.deleteMessage();
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    
    if (state && state.testCode) {
        await showStudentSearch(ctx, userId, state.testCode);
    } else {
        await ctx.reply('❌ Ошибка: данные утеряны. Используйте команду /tests для выбора теста.');
    }
});

bot.action(/answer:(\d+)/, async (ctx) => {
    const answerIndex = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    const result = testManager.answerQuestion(userId, answerIndex);
    if (!result) {
        await ctx.reply('❌ Сессия теста не найдена или тест уже завершен');
        return;
    }
    
    const { session, isCorrect, isCompleted } = result;
    
    try {
        await ctx.editMessageText(
            `✅ *Ответ принят!*\n\n${isCorrect ? '✅ Правильно! (+' + session.allQuestions[session.currentQuestionIndex - 1].points + ' балл)' : '❌ Неправильно'}\n${isCompleted ? '\n⏳ *Подсчитываем результаты...*' : ''}`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        // Игнорируем ошибки редактирования сообщения
    }
    
    if (isCompleted) {
        setTimeout(() => finishTest(ctx, session), 2000);
    } else {
        setTimeout(() => showQuestion(ctx, session), 2000);
    }
});

bot.action('show_my_results', async (ctx) => {
    await ctx.deleteMessage();
    const userId = ctx.from.id;
    const results = await FirebaseService.getUserResults(userId);
    
    if (results.length === 0) {
        await ctx.reply('📭 *Результатов пока нет*\n\nПройдите тест, чтобы увидеть результаты!', { 
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
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ==================== ОБРАБОТКА ТЕКСТА ====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const text = ctx.message.text;
    
    // Обработка кнопок клавиатуры
    if (text === '🚀 Начать тест ttii7') {
        await startTestProcess(ctx, userId, 'ttii7');
        return;
    }
    
    if (text === '📚 Список тестов') {
        const tests = testLoader.getAvailableTests();
        const buttons = tests.map(test => [
            Markup.button.callback(test.title, `start_test:${test.name}`)
        ]);
        
        await ctx.reply('📚 *Доступные тесты:*\n\nВыберите тест для прохождения:', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
        return;
    }
    
    if (text === '📊 Мои результаты') {
        const results = await FirebaseService.getUserResults(userId);
        
        if (results.length === 0) {
            await ctx.reply('📭 *Результатов пока нет*\n\nПройдите тест, чтобы увидеть результаты!', { 
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
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
        return;
    }
    
    if (text === '🆘 Помощь') {
        await bot.telegram.sendMessage(ctx.chat.id, `🆘 *Помощь и поддержка*\n\n📞 Контакты: @garickbox\n🌐 Сайт: ${CONFIG.MAIN_WEBSITE}`, {
            parse_mode: 'Markdown'
        });
        return;
    }
    
    // Обработка ввода данных ученика
    if (state && state.step === 'awaiting_student') {
        const parts = text.trim().split(/\s+/);
        
        if (parts.length >= 2) {
            const lastName = parts[0];
            const firstName = parts[1];
            const className = parts[2] || '';
            
            // Валидация класса
            if (className && !['7','8','9','10','11'].includes(className)) {
                await ctx.reply('❌ Класс должен быть числом от 7 до 11\n\nВведите: Фамилия Имя [Класс]');
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
                
                await ctx.reply(`🔍 *Найдены ученики:*\n\nВыберите ваше имя из списка:`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(buttons)
                });
            } else {
                await ctx.reply('❌ *Ученик не найден*\n\nПроверьте:\n1. Правильность Фамилии и Имени\n2. Укажите класс (7-11)\n3. Попробуйте еще раз\n\nПример: `Иванов Иван 7`', {
                    parse_mode: 'Markdown'
                });
            }
        } else {
            await ctx.reply('❌ *Неверный формат*\n\nВведите: `Фамилия Имя [Класс]`\n\nПримеры:\n`Иванов Иван 7`\n`Петрова Анна` (если не знаете класс)', {
                parse_mode: 'Markdown'
            });
        }
    }
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
async function startTestProcess(ctx, userId, testCode) {
    try {
        // Проверяем существование теста
        const tests = testLoader.getAvailableTests();
        const testExists = tests.some(test => test.name === testCode);
        
        if (!testExists) {
            await ctx.reply(`❌ Тест "${testCode}" не найден\n\nИспользуйте /tests для списка доступных тестов`, {
                parse_mode: 'Markdown'
            });
            return;
        }
        
        userStates.set(userId, { 
            step: 'awaiting_student', 
            testCode 
        });
        
        await ctx.reply('👤 *Идентификация ученика*\n\nВведите ваши данные в формате:\n`Фамилия Имя [Класс]`\n\n*Примеры:*\n`Иванов Иван 7`\n`Петрова Анna` (если не знаете класс)\n\n_Класс указывать необязательно, но это ускорит поиск_', {
            parse_mode: 'Markdown',
            ...Markup.removeKeyboard()
        });
    } catch (error) {
        console.error('Ошибка начала теста:', error);
        await ctx.reply(`❌ *Ошибка:* ${error.message}\n\nПопробуйте позже или используйте /tests для выбора теста`, {
            parse_mode: 'Markdown'
        });
    }
}

async function showStudentSearch(ctx, userId, testCode) {
    userStates.set(userId, { 
        step: 'awaiting_student', 
        testCode 
    });
    
    await ctx.reply('👤 *Введите данные заново:*\n`Фамилия Имя [Класс]`\n\nПример: `Иванов Иван 7`', {
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
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    } catch (error) {
        console.error('Ошибка показа вопроса:', error);
        await ctx.reply('❌ Произошла ошибка при загрузке вопроса. Пожалуйста, начните тест заново.');
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
        await ctx.reply('❌ Произошла ошибка при сохранении результатов. Пожалуйста, свяжитесь с администратором.');
    }
}

// ==================== ОБРАБОТКА ОШИБОК ====================
bot.catch((err, ctx) => {
    console.error(`Ошибка для пользователя ${ctx.from?.id}:`, err);
    ctx.reply('❌ Произошла непредвиденная ошибка. Пожалуйста, попробуйте позже или обратитесь к администратору @garickbox');
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
