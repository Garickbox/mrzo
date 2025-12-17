// ====================================================================
// ОСНОВНОЙ СКРИПТ СИСТЕМЫ ТЕСТИРОВАНИЯ
// Версия 7.4 - Отправка в Telegram при показе оценки
// ====================================================================

// Глобальные переменные системы
let currentQuestionIndex = 0;
let totalScore = 0;
let userAnswers = [];
let shuffledQuestionsAndProblems = [];
let isSubmitted = false;
let isShowingAnswer = false;
let currentShuffledOptions = [];
let testStarted = false;
let testCompleted = false;

// Для сохранения прогресса
let isTestRestored = false;
let testStartTimestamp = 0;
let skipQuestions = [];

// Переменные для отслеживания использования пасхалок
let clipboardAttempts = 0;
let tabSwitchAttempts = 0;
let cheatBlockTimeouts = 0;
let clipboardBlocked = false;
let antiCheatTriggered = false;

// Глобальная переменная для выбранного ученика
let selectedStudent = null;

// ПАСХАЛКА 1: Антикопирование
const clipboardMessages = [
    "Высоковская школа: честность — наш девиз!",
    "Упс! Копирование учебных материалов запрещено.",
    "Знания ценны, когда добыты честным путём!",
    "Наш антижульничательный детектор сработал!",
    "Вы же не хотите попасть в школьный архив нарушителей?",
    "Учителя видют всё... даже попытки копирования!",
    "Этот текст самоуничтожился при попытке копирования!",
    "Вместо списанного ответа — мудрый совет: учитесь!",
    "Школьный совет по этике не одобряет это копирование.",
    "Зафиксирована попытка несанкционированного копирования!",
    "Хм... а если бы все так делали? Хаос наступил бы!",
    "Высоковская школа гордится честными учениками!",
    "Это не ответ на тест, это тест на вашу честность!",
    "Попытка скопировать зафиксирована в школьном журнале!",
    "Знания нельзя скопировать, их можно только понять!",
    "Ваша попытка скопировать текст самоуничтожилась!",
    "Ученик, остановись! Ты выбрал нечестный путь!",
    "Школьный антиплагиат всегда на страже!",
    "Вместо списанного текста — напоминание о правилах!",
    "Честная «тройка» лучше, чем списанная «пятёрка»!"
];

// ПАСХАЛКА 2: Античит система
const cheatMessages = [
    "Ой! Кажется, наш детектор жульничества снова сработал! 📡",
    "Ш-ш-ш! Вы пытались подсмотреть ответы? Не выйдет! 👀",
    "Высоковский античит-радар засек подозрительную активность! 🚨",
    "Кажется, кто-то искал Google вместо знаний... 🔍",
    "Школьные правила: 1) Не жульничать 2) См. пункт 1 📚",
    "Наш ИИ-учитель заметил вашу хитрость! 🤖",
    "Вместо подсматривания - подумайте! Мозг тренируется 💪",
    "Вы пойманы на горячем! Вернее, на 'Ctrl+C' 🎯",
    "Шепотом: 'Честность — лучшая политика'. Кричим: 'НЕ СПИСЫВАТЬ!' 📢",
    "Ваша попытка жульничества самоуничтожится через... *смотрит на таймер*",
    "Учителя уже в курсе! Ну, почти... 👨‍🏫",
    "Вы активировали режим 'Честный ученик'. Ожидайте... ⏳",
    "Наши сенсоры засекли утечку мозгов в другую вкладку! 🧠",
    "Кажется, вы нашли клавишу 'Копировать', но потеряли 'Думать' 🤔",
    "Школьный хакер-детектор v2.0: Жульничество — 0, Честность — 1 🏆",
    "Вам бан! Шутка... но ненадолго 😄",
    "Вы перешли границу Ученик-Google. Возвращайтесь! 🚧",
    "Система 'Честный тест' активирована. Обратный отсчет начался! ⏰",
    "Наш робот-надзиратель не дремлет! 🤖👮",
    "Ещё одна попытка — и мы вызовем директора! Ну, почти... 🏫"
];

// DOM элементы
let progressBar, progressText, questionText, questionType, optionsContainer, confirmBtn;
let fullscreenResult, fullscreenGrade;
let fullscreenScore, fullscreenBreakdown, finishBtn, startTestBtn, refreshBtn;
let studentInfoSection, testContent, blockerOverlay, anticheatModal;
let cheatMessageElement, countdownTimer, passwordInput, continueBtn;

// Константы античит системы
const PASSWORD = "3265";
let blockTimer = null;
let remainingTime = 0;
let cheatAttempts = 0;

// Таймер автосохранения
let saveTimer = null;

// ==================== АВТОСОХРАНЕНИЕ ====================

/**
 * Сохранить прогресс теста в localStorage
 */
function saveProgress() {
    if (!testStarted || testCompleted) return;
    
    const progress = {
        testName: window.TEST_CONFIG.title,
        student: window.STUDENT_INFO,
        currentQuestionIndex: currentQuestionIndex,
        userAnswers: userAnswers,
        totalScore: totalScore,
        shuffledQuestionsAndProblems: shuffledQuestionsAndProblems,
        timestamp: Date.now(),
        startedAt: testStartTimestamp,
        skipQuestions: skipQuestions,
        isTestRestored: isTestRestored
    };
    
    try {
        localStorage.setItem('testProgress', JSON.stringify(progress));
        console.log('💾 Прогресс сохранен');
    } catch (e) {
        console.error('Ошибка сохранения:', e);
    }
}

/**
 * Загрузить прогресс из localStorage
 */
function loadProgress() {
    const saved = localStorage.getItem('testProgress');
    if (!saved) return null;
    
    try {
        const progress = JSON.parse(saved);
        
        // Проверяем, что это тот же тест и прошло не более 2 часов
        if (progress.testName === window.TEST_CONFIG.title && 
            (Date.now() - progress.timestamp) < 2 * 60 * 60 * 1000) {
            return progress;
        } else {
            localStorage.removeItem('testProgress');
        }
    } catch (e) {
        console.error('Ошибка загрузки прогресса:', e);
        localStorage.removeItem('testProgress');
    }
    
    return null;
}

/**
 * Восстановить тест
 */
function restoreTest() {
    const progress = loadProgress();
    if (!progress) return false;
    
    if (!confirm(`Обнаружен незавершенный тест "${progress.testName}" от ${new Date(progress.timestamp).toLocaleString()}.\n\nВосстановить прогресс?`)) {
        localStorage.removeItem('testProgress');
        return false;
    }
    
    // Восстанавливаем данные
    currentQuestionIndex = progress.currentQuestionIndex;
    userAnswers = progress.userAnswers;
    totalScore = progress.totalScore;
    shuffledQuestionsAndProblems = progress.shuffledQuestionsAndProblems;
    skipQuestions = progress.skipQuestions || [];
    window.STUDENT_INFO = progress.student;
    
    // Восстанавливаем выбранного ученика
    if (window.STUDENT_INFO) {
        selectedStudent = {
            id: window.STUDENT_INFO.id,
            lastName: window.STUDENT_INFO.lastName,
            firstName: window.STUDENT_INFO.firstName,
            class: window.STUDENT_INFO.class,
            isAdmin: window.STUDENT_INFO.isAdmin || false
        };
    }
    
    skipQuestions.forEach(index => {
        userAnswers[index] = null;
    });
    
    testStarted = true;
    isTestRestored = true;
    testStartTimestamp = progress.startedAt;
    isShowingAnswer = false;
    
    if (studentInfoSection) studentInfoSection.style.display = 'none';
    if (testContent) testContent.style.display = 'block';
    
    triggerAnticheat();
    
    console.log('🔄 Тест восстановлен с вопроса', currentQuestionIndex + 1);
    console.log('📊 Сохраненные ответы:', userAnswers);
    console.log('⏭️ Пропущенные вопросы:', skipQuestions);
    console.log('⚠️ isShowingAnswer после восстановления:', isShowingAnswer);
    
    return true;
}

/**
 * Начать автосохранение
 */
function startAutoSave() {
    if (saveTimer) clearInterval(saveTimer);
    
    saveTimer = setInterval(() => {
        if (testStarted && !testCompleted) {
            saveProgress();
        }
    }, 30000);
    
    console.log('🔄 Автосохранение запущено');
}

/**
 * Остановить автосохранение
 */
function stopAutoSave() {
    if (saveTimer) {
        clearInterval(saveTimer);
        saveTimer = null;
        console.log('🛑 Автосохранение остановлено');
    }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ТЕСТА ====================

function initTest() {
    console.log('🚀 Инициализация теста:', window.TEST_CONFIG.title);
    
    if (!window.TEST_CONFIG) {
        console.error('❌ Конфигурация теста не загружена!');
        showError('Конфигурация теста не загружена. Проверьте код теста.');
        return;
    }
    
    if (!window.questionsBank || !window.problemsBank) {
        console.error('❌ Банки вопросов не загружены!');
        showError('Вопросы теста не загружены.');
        return;
    }
    
    cacheDOMElements();
    
    console.log('📊 Вопросов в банке:', window.questionsBank.length);
    console.log('📊 Задач в банке:', window.problemsBank.length);
    console.log('🎯 Максимальный балл:', window.TEST_CONFIG.maxScore);
    
    document.title = window.TEST_CONFIG.title;
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        pageTitle.textContent = window.TEST_CONFIG.title;
    }
    
    setupEventListeners();
    setupAnticopySystem();
    
    // ВАЖНОЕ ИСПРАВЛЕНИЕ: Проверяем наличие сохраненного ученика перед восстановлением теста
    checkAndRestoreStudent();
    
    if (!restoreTest()) {
        console.log('🆕 Начинаем новый тест');
    } else {
        startAutoSave();
    }
    
    console.log('✅ Тест инициализирован успешно');
}

/**
 * Проверяем и восстанавливаем выбранного ученика из localStorage
 * Это ключевое исправление для запоминания ученика между тестами
 */
function checkAndRestoreStudent() {
    console.log('🔍 Проверяем сохраненного ученика...');
    
    // Пытаемся восстановить ученика из localStorage
    const savedStudent = localStorage.getItem('lastStudent');
    const savedTestProgress = localStorage.getItem('testProgress');
    
    if (savedStudent) {
        try {
            const studentData = JSON.parse(savedStudent);
            console.log('🎯 Найден сохраненный ученик:', studentData);
            
            // Если у нас уже есть выбранный ученик, не перезаписываем его
            if (!window.selectedStudent) {
                window.selectedStudent = studentData;
                console.log('✅ Восстановлен выбранный ученик');
            }
            
            // Также восстанавливаем STUDENT_INFO для совместимости
            if (!window.STUDENT_INFO && window.selectedStudent) {
                window.STUDENT_INFO = {
                    id: window.selectedStudent.id,
                    name: window.selectedStudent.lastName + ' ' + window.selectedStudent.firstName,
                    lastName: window.selectedStudent.lastName,
                    firstName: window.selectedStudent.firstName,
                    class: window.selectedStudent.class,
                    isAdmin: window.selectedStudent.isAdmin || false
                };
                console.log('✅ Восстановлен STUDENT_INFO');
            }
            
            // ВАЖНО: Если есть testProgress, но это другой тест,
            // мы все равно должны сохранить ученика для текущего теста
            if (savedTestProgress) {
                try {
                    const progress = JSON.parse(savedTestProgress);
                    if (progress.testName !== window.TEST_CONFIG.title) {
                        // Это другой тест, но ученик тот же
                        console.log('📚 Другой тест, сохраняем ученика для нового теста');
                        
                        // Обновляем ученика в testProgress для текущего теста
                        if (window.STUDENT_INFO) {
                            progress.student = window.STUDENT_INFO;
                            localStorage.setItem('testProgress', JSON.stringify(progress));
                            console.log('✅ Обновлен ученик в testProgress');
                        }
                    }
                } catch (e) {
                    console.error('Ошибка при проверке testProgress:', e);
                }
            }
            
        } catch (e) {
            console.error('Ошибка восстановления ученика:', e);
            localStorage.removeItem('lastStudent');
        }
    } else {
        console.log('📭 Сохраненный ученик не найден');
    }
}

function cacheDOMElements() {
    progressBar = document.getElementById('progress-bar');
    progressText = document.getElementById('progress-text');
    questionText = document.getElementById('question-text');
    questionType = document.getElementById('question-type');
    optionsContainer = document.getElementById('options-container');
    confirmBtn = document.getElementById('confirm-btn');
    refreshBtn = document.getElementById('refresh-btn');
    fullscreenResult = document.getElementById('fullscreen-result');
    fullscreenGrade = document.getElementById('fullscreen-grade');
    fullscreenScore = document.getElementById('fullscreen-score');
    fullscreenBreakdown = document.getElementById('fullscreen-breakdown');
    finishBtn = document.getElementById('finish-btn');
    startTestBtn = document.getElementById('start-test-btn');
    studentInfoSection = document.getElementById('student-info-section');
    testContent = document.getElementById('test-content');
    blockerOverlay = document.getElementById('blockerOverlay');
    anticheatModal = document.getElementById('anticheatModal');
    cheatMessageElement = document.getElementById('cheatMessage');
    countdownTimer = document.getElementById('countdownTimer');
    passwordInput = document.getElementById('passwordInput');
    continueBtn = document.getElementById('continueBtn');
    
    console.log('🔍 Кэширование DOM элементов:');
    console.log('- finishBtn найден:', !!finishBtn);
    console.log('- refreshBtn найден:', !!refreshBtn);
    console.log('- fullscreenResult найден:', !!fullscreenResult);
}

function showError(message) {
    const studentInfoSection = document.getElementById('student-info-section');
    if (studentInfoSection) {
        studentInfoSection.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f44336;"></i>
                <h3 style="color: #f44336; margin: 20px 0;">Ошибка загрузки</h3>
                <p>${message}</p>
                <button onclick="window.location.href='index.html'" 
                        style="background: #4b6cb7; color: white; border: none; padding: 12px 24px; 
                               border-radius: 8px; margin-top: 20px; cursor: pointer;">
                    <i class="fas fa-arrow-left"></i> Вернуться на главную
                </button>
            </div>
        `;
    }
}

// ==================== НАСТРОЙКА СИСТЕМЫ ====================

function setupEventListeners() {
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmAnswer);
        console.log('✅ Обработчик для confirmBtn установлен');
    }
    
    if (finishBtn) {
        console.log('🎯 Назначаем обработчик для finishBtn');
        finishBtn.addEventListener('click', finishFullScreen);
        console.log('✅ Обработчик для finishBtn установлен');
    } else {
        console.error('❌ finishBtn не найден в DOM!');
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', skipQuestion);
        console.log('✅ Обработчик для refreshBtn установлен');
    }
    
    if (continueBtn) {
        continueBtn.addEventListener('click', function() {
            if (!this.disabled) {
                closeAntiCheat();
                if (isTestRestored) {
                    showQuestion(currentQuestionIndex);
                    isTestRestored = false;
                }
            }
        });
    }
    
    if (passwordInput) {
        passwordInput.addEventListener('input', function(e) {
            this.value = this.value.replace(/\D/g, '');
            
            if (this.value.length === 4) {
                if (this.value === PASSWORD) {
                    continueBtn.disabled = false;
                    setTimeout(() => {
                        if (continueBtn) continueBtn.click();
                    }, 500);
                }
            }
        });
    }
    
    window.addEventListener('beforeunload', function(e) {
        if (testStarted && !testCompleted) {
            e.preventDefault();
            e.returnValue = 'Вы уверены, что хотите покинуть страницу? Весь прогресс теста будет сохранен.';
            saveProgress();
            return 'Вы уверены, что хотите покинуть страницу? Весь прогресс теста будет сохранен.';
        }
    });
    
    console.log('✅ Все обработчики событий установлены');
}

function setupAnticopySystem() {
    function isInsideInput(element) {
        if (!element) return false;
        
        let currentElement = element;
        while (currentElement) {
            if (currentElement.tagName === 'INPUT' || 
                currentElement.tagName === 'TEXTAREA' || 
                (currentElement.classList && currentElement.classList.contains('test-input'))) {
                return true;
            }
            currentElement = currentElement.parentElement;
        }
        return false;
    }

    document.addEventListener('copy', function(e) {
        const selection = window.getSelection();
        const selectedText = selection.toString();
        
        if (selectedText.length > 0 && !isInsideInput(document.activeElement)) {
            const randomIndex = Math.floor(Math.random() * clipboardMessages.length);
            const randomMessage = clipboardMessages[randomIndex];
            
            e.clipboardData.setData('text/plain', randomMessage);
            e.preventDefault();
            
            clipboardAttempts++;
            clipboardBlocked = true;
            
            console.log(`Попытка копирования заблокирована (${clipboardAttempts} раз)`);
        }
    });

    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            if (!isInsideInput(document.activeElement)) {
                e.preventDefault();
                clipboardAttempts++;
                clipboardBlocked = true;
                console.log(`Попытка выделения всего текста заблокирована (${clipboardAttempts} раз)`);
            }
        }
    });

    document.addEventListener('dragstart', function(e) {
        if (!isInsideInput(e.target)) {
            e.preventDefault();
            clipboardAttempts++;
            clipboardBlocked = true;
            console.log(`Попытка перетаскивания текста заблокирована (${clipboardAttempts} раз)`);
        }
    });
}

// ==================== ОСНОВНАЯ ЛОГИКА ТЕСТИРОВАНИЯ ====================

window.startTestFromScript = function() {
    console.log('🚀 Тест начат для ученика:', window.STUDENT_INFO);
    
    testStarted = true;
    testStartTimestamp = Date.now();
    
    startAnticheatMonitoring();
    startAutoSave();
    
    initQuestions();
    showQuestion(0);
    
    console.log('✅ Тест начат');
    console.log('🚀 Античит мониторинг активирован');
};

function initQuestions() {
    if (!window.questionsBank || window.questionsBank.length < window.TEST_CONFIG.totalQuestions) {
        console.error('❌ Недостаточно теоретических вопросов');
        showError(`Недостаточно теоретических вопросов. Нужно: ${window.TEST_CONFIG.totalQuestions}, доступно: ${window.questionsBank ? window.questionsBank.length : 0}`);
        return;
    }
    
    if (!window.problemsBank || window.problemsBank.length < window.TEST_CONFIG.totalProblems) {
        console.error('❌ Недостаточно задач');
        showError(`Недостаточно задач. Нужно: ${window.TEST_CONFIG.totalProblems}, доступно: ${window.problemsBank ? window.problemsBank.length : 0}`);
        return;
    }
    
    const selectedQuestions = shuffleArray([...window.questionsBank]).slice(0, window.TEST_CONFIG.totalQuestions);
    const selectedProblems = shuffleArray([...window.problemsBank]).slice(0, window.TEST_CONFIG.totalProblems);
    
    shuffledQuestionsAndProblems = [...selectedQuestions, ...selectedProblems];
    shuffledQuestionsAndProblems = shuffleArray(shuffledQuestionsAndProblems);
    
    currentQuestionIndex = 0;
    totalScore = 0;
    userAnswers = Array(window.TEST_CONFIG.totalQuestions + window.TEST_CONFIG.totalProblems).fill(null);
    isSubmitted = false;
    isShowingAnswer = false;
    currentShuffledOptions = [];
    skipQuestions = [];
    
    clipboardAttempts = 0;
    tabSwitchAttempts = 0;
    cheatBlockTimeouts = 0;
    clipboardBlocked = false;
    antiCheatTriggered = false;
    
    if (confirmBtn) confirmBtn.disabled = false;
    if (refreshBtn) refreshBtn.disabled = false;
    if (fullscreenResult) fullscreenResult.style.display = 'none';
    
    console.log(`✅ Выбрано ${selectedQuestions.length} вопросов и ${selectedProblems.length} задач`);
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function showQuestion(index) {
    if (!shuffledQuestionsAndProblems || index >= shuffledQuestionsAndProblems.length) {
        console.error('Нет вопросов для отображения');
        return;
    }
    
    const item = shuffledQuestionsAndProblems[index];
    
    if (questionText) questionText.textContent = item.text;
    
    if (item.points === 3) {
        if (questionType) {
            questionType.textContent = "Задача (3 балла)";
            questionType.className = "question-type problem-type";
        }
    } else {
        if (questionType) {
            questionType.textContent = "Теоретический вопрос (1 балл)";
            questionType.className = "question-type";
        }
    }
    
    currentShuffledOptions = shuffleArray([...item.options]);
    isShowingAnswer = false;
    
    console.log(`🔍 Показ вопроса ${index + 1}, isShowingAnswer = ${isShowingAnswer}, userAnswers[${index}] = ${userAnswers[index]}`);
    
    if (optionsContainer) {
        optionsContainer.innerHTML = '';
        
        currentShuffledOptions.forEach((option, i) => {
            const label = document.createElement('label');
            label.className = 'option-label';
            
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'option';
            radio.value = option.v;
            radio.disabled = isShowingAnswer;
            
            label.appendChild(radio);
            label.appendChild(document.createTextNode(option.t));
            
            if (!isShowingAnswer) {
                label.addEventListener('click', () => {
                    document.querySelectorAll('.option-label').forEach(l => l.classList.remove('selected'));
                    label.classList.add('selected');
                    radio.checked = true;
                    
                    if (confirmBtn) confirmBtn.disabled = false;
                });
            } else {
                if (userAnswers[index] === option.v) {
                    if (option.v === 'correct') {
                        label.classList.add('correct');
                    } else {
                        label.classList.add('incorrect');
                    }
                }
            }
            
            optionsContainer.appendChild(label);
        });
    }
    
    if (confirmBtn) confirmBtn.disabled = true;
    
    if (refreshBtn) {
        const totalQuestions = shuffledQuestionsAndProblems.length;
        const answeredQuestions = userAnswers.filter(answer => answer !== null).length;
        const remainingQuestions = totalQuestions - answeredQuestions - skipQuestions.length;
        
        if (isShowingAnswer || remainingQuestions <= 1) {
            refreshBtn.disabled = true;
            refreshBtn.title = isShowingAnswer ? "Дождитесь окончания показа ответа" : "Это последний непропущенный вопрос";
        } else {
            refreshBtn.disabled = false;
            refreshBtn.title = "Вернуться к этому вопросу позже";
        }
    }
    
    updateProgress();
}

function highlightCorrectAnswer() {
    const options = optionsContainer.querySelectorAll('.option-label');
    
    options.forEach((option, index) => {
        const radio = option.querySelector('input');
        const optionValue = currentShuffledOptions[index].v;
        
        if (optionValue === 'correct') {
            option.classList.add('correct');
        }
        
        if (radio && radio.checked && optionValue === 'wrong') {
            option.classList.add('incorrect');
        }
        
        if (radio) radio.disabled = true;
    });
}

function updateProgress() {
    if (!progressBar || !progressText) return;
    
    const totalQuestions = shuffledQuestionsAndProblems.length;
    const answeredQuestions = userAnswers.filter(answer => answer !== null).length;
    const percent = (answeredQuestions / totalQuestions) * 100;
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `Вопрос ${currentQuestionIndex + 1} из ${totalQuestions} (отвечено: ${answeredQuestions})`;
}

function confirmAnswer() {
    const selectedOption = document.querySelector('input[name="option"]:checked');
    if (!selectedOption) {
        alert('Выберите вариант ответа');
        return;
    }
    
    userAnswers[currentQuestionIndex] = selectedOption.value;
    
    if (confirmBtn) confirmBtn.disabled = true;
    if (refreshBtn) refreshBtn.disabled = true;
    isShowingAnswer = true;
    
    highlightCorrectAnswer();
    
    setTimeout(() => {
        isShowingAnswer = false;
        
        saveProgress();
        
        if (skipQuestions.includes(currentQuestionIndex)) {
            skipQuestions = skipQuestions.filter(idx => idx !== currentQuestionIndex);
        }
        
        let nextIndex = -1;
        
        for (let i = currentQuestionIndex + 1; i < shuffledQuestionsAndProblems.length; i++) {
            if (userAnswers[i] === null && !skipQuestions.includes(i)) {
                nextIndex = i;
                break;
            }
        }
        
        if (nextIndex === -1) {
            for (let i = 0; i < currentQuestionIndex; i++) {
                if (userAnswers[i] === null && !skipQuestions.includes(i)) {
                    nextIndex = i;
                    break;
                }
            }
        }
        
        if (nextIndex === -1 && skipQuestions.length > 0) {
            nextIndex = skipQuestions[0];
            skipQuestions = skipQuestions.filter(idx => idx !== nextIndex);
        }
        
        if (nextIndex !== -1) {
            currentQuestionIndex = nextIndex;
            showQuestion(currentQuestionIndex);
        } else {
            localStorage.removeItem('testProgress');
            stopAutoSave();
            showResults();
        }
    }, 2000);
}

function skipQuestion() {
    if (!shuffledQuestionsAndProblems || currentQuestionIndex >= shuffledQuestionsAndProblems.length) {
        console.log('❌ Нельзя пропустить вопрос');
        return;
    }
    
    const totalQuestions = shuffledQuestionsAndProblems.length;
    const answeredQuestions = userAnswers.filter(answer => answer !== null).length;
    const remainingQuestions = totalQuestions - answeredQuestions - skipQuestions.length;
    
    if (remainingQuestions <= 1) {
        alert('Это последний непропущенный вопрос. Пропустить нельзя.');
        return;
    }
    
    console.log('⏭️ Пропускаем вопрос', currentQuestionIndex + 1);
    
    if (!skipQuestions.includes(currentQuestionIndex)) {
        skipQuestions.push(currentQuestionIndex);
    }
    
    userAnswers[currentQuestionIndex] = null;
    saveProgress();
    
    let nextIndex = -1;
    for (let i = currentQuestionIndex + 1; i < shuffledQuestionsAndProblems.length; i++) {
        if (userAnswers[i] === null && !skipQuestions.includes(i)) {
            nextIndex = i;
            break;
        }
    }
    
    if (nextIndex === -1) {
        for (let i = 0; i < currentQuestionIndex; i++) {
            if (userAnswers[i] === null && !skipQuestions.includes(i)) {
                nextIndex = i;
                break;
            }
        }
    }
    
    if (nextIndex !== -1) {
        currentQuestionIndex = nextIndex;
        showQuestion(currentQuestionIndex);
        
        console.log('✅ Вопрос пропущен, переходим к вопросу', currentQuestionIndex + 1);
        console.log('⏭️ Всего пропущенных вопросов:', skipQuestions.length);
    } else {
        if (skipQuestions.length > 0) {
            nextIndex = skipQuestions[0];
            skipQuestions = skipQuestions.filter(idx => idx !== nextIndex);
            currentQuestionIndex = nextIndex;
            showQuestion(currentQuestionIndex);
            alert('Все вопросы просмотрены. Возвращаемся к пропущенным вопросам.');
        }
    }
}

// ==================== РЕЗУЛЬТАТЫ И ОЦЕНКИ ====================

function showResults() {
    testCompleted = true;
    
    stopAnticheatMonitoring();
    stopAutoSave();
    
    if (testContent) testContent.style.display = 'none';
    
    totalScore = 0;
    let questionScore = 0;
    let problemScore = 0;
    let correctQuestions = 0;
    let correctProblems = 0;
    
    for (let i = 0; i < shuffledQuestionsAndProblems.length; i++) {
        const item = shuffledQuestionsAndProblems[i];
        if (userAnswers[i] === 'correct') {
            totalScore += item.points;
            if (item.points === 1) {
                questionScore += 1;
                correctQuestions++;
            } else if (item.points === 3) {
                problemScore += 3;
                correctProblems++;
            }
        }
    }
    
    window.TEST_CONFIG.correctQuestions = correctQuestions;
    window.TEST_CONFIG.correctProblems = correctProblems;
    
    const grade = calculateGrade(totalScore);
    const maxScore = window.TEST_CONFIG.maxScore;
    
    // ВАЖНОЕ ИЗМЕНЕНИЕ: Отправляем результаты в Telegram сразу при показе оценки
    console.log('📤 Отправляем результаты в Telegram...');
    sendResultsToTelegram(
        parseInt(grade),
        correctQuestions,
        correctProblems,
        questionScore,
        problemScore
    );
    
    showFullscreenResult(grade, totalScore, maxScore, correctQuestions, correctProblems, questionScore, problemScore);
    
    console.log('📊 Тест завершен. Результаты:', {
        score: totalScore,
        grade: grade,
        correctAnswers: correctQuestions + correctProblems,
        totalQuestions: shuffledQuestionsAndProblems.length,
        skippedQuestions: skipQuestions.length
    });
}

function calculateGrade(score) {
    const scale = window.TEST_CONFIG.gradingScale;
    
    if (score >= scale[5]) return 5;
    if (score >= scale[4]) return 4;
    if (score >= scale[3]) return 3;
    return 2;
}

function getGradeColor(grade) {
    const colors = {
        5: '#4CAF50',
        4: '#8BC34A',
        3: '#FFC107',
        2: '#F44336'
    };
    return colors[grade] || '#333';
}

function showFullscreenResult(grade, score, maxScore, correctQuestions, correctProblems, questionScore, problemScore) {
    console.log('📱 Показываем полноэкранный результат...');
    
    if (!fullscreenResult || !fullscreenGrade || !fullscreenScore || !fullscreenBreakdown) {
        console.error('❌ Не найдены элементы полноэкранного результата');
        return;
    }
    
    fullscreenResult.style.display = 'flex';
    
    const gradeScreen = document.getElementById('grade-screen');
    const acceptedScreen = document.getElementById('accepted-screen');
    
    if (gradeScreen && acceptedScreen) {
        gradeScreen.style.display = 'block';
        acceptedScreen.style.display = 'none';
    }
    
    fullscreenGrade.textContent = grade;
    fullscreenGrade.style.color = getGradeColor(grade);
    fullscreenScore.textContent = `${score} из ${maxScore}`;
    
    const fullscreenMaxScore = document.getElementById('fullscreen-max-score');
    if (fullscreenMaxScore) {
        fullscreenMaxScore.textContent = maxScore;
    }
    
    fullscreenBreakdown.innerHTML = `
        <div>Правильных вопросов: ${correctQuestions} из ${window.TEST_CONFIG.totalQuestions} (${questionScore} баллов)</div>
        <div>Правильных задач: ${correctProblems} из ${window.TEST_CONFIG.totalProblems} (${problemScore} баллов)</div>
        <div>Всего баллов: ${score} из ${maxScore}</div>
    `;
    
    console.log('✅ Полноэкранный результат показан');
}

function finishFullScreen() {
    console.log('🔄 Нажата кнопка "Завершить"');
    
    if (!fullscreenResult || !fullscreenGrade || !fullscreenScore || !fullscreenBreakdown) {
        console.error('❌ Не найдены элементы для завершения');
        return;
    }
    
    const grade = fullscreenGrade.textContent;
    const scoreText = fullscreenScore.textContent;
    
    const scoreMatch = scoreText.match(/(\d+)\s*из\s*(\d+)/);
    let score = 0;
    let maxScore = window.TEST_CONFIG.maxScore;
    
    if (scoreMatch) {
        score = scoreMatch[1];
        maxScore = scoreMatch[2];
    } else {
        console.warn('Не удалось извлечь баллы из текста:', scoreText);
    }
    
    const breakdown = `
        <div style="margin-bottom: 8px;">Правильных вопросов: ${window.TEST_CONFIG.correctQuestions || 0} из ${window.TEST_CONFIG.totalQuestions}</div>
        <div style="margin-bottom: 8px;">Правильных задач: ${window.TEST_CONFIG.correctProblems || 0} из ${window.TEST_CONFIG.totalProblems}</div>
        <div>Всего баллов: ${score} из ${maxScore}</div>
    `;
    
    console.log('🔄 Переключаем на экран "Работа принята"');
    
    const gradeScreen = document.getElementById('grade-screen');
    const acceptedScreen = document.getElementById('accepted-screen');
    
    if (gradeScreen && acceptedScreen) {
        gradeScreen.style.display = 'none';
        acceptedScreen.style.display = 'block';
        
        const acceptedGrade = document.getElementById('accepted-grade');
        const acceptedScore = document.getElementById('accepted-score');
        const acceptedMaxScore = document.getElementById('accepted-max-score');
        const acceptedBreakdown = document.getElementById('accepted-breakdown');
        const timerMessage = document.getElementById('timer-message');
        
        if (acceptedGrade) acceptedGrade.textContent = grade;
        if (acceptedScore) acceptedScore.textContent = score;
        if (acceptedMaxScore) acceptedMaxScore.textContent = maxScore;
        if (acceptedBreakdown) acceptedBreakdown.innerHTML = breakdown;
        
        console.log('⏱️ Запускаем таймер обратного отсчета...');
        
        let seconds = 8;
        if (timerMessage) {
            timerMessage.textContent = `Через ${seconds} секунд вы будете перенаправлены на главную страницу...`;
        }
        
        const timerInterval = setInterval(() => {
            seconds--;
            if (timerMessage) {
                timerMessage.textContent = `Через ${seconds} секунд вы будете перенаправлены на главную страницу...`;
            }
            
            if (seconds <= 0) {
                clearInterval(timerInterval);
                console.log('🔄 Перенаправляем на главную страницу...');
                window.location.href = "index.html";
            }
        }, 1000);
    } else {
        console.error('❌ Не найдены элементы экранов');
        console.log('- gradeScreen:', gradeScreen);
        console.log('- acceptedScreen:', acceptedScreen);
    }
}

// ==================== АНТИЧИТ СИСТЕМА ====================

function startAnticheatMonitoring() {
    console.log('🔍 Запуск мониторинга античит системы');
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
}

function stopAnticheatMonitoring() {
    console.log('🛑 Остановка мониторинга античит системы');
    
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);
    window.removeEventListener('focus', handleWindowFocus);
}

function handleVisibilityChange() {
    if (document.hidden && testStarted && !testCompleted) {
        console.log('👀 Страница скрыта - срабатывает античит');
        triggerAnticheat();
    }
}

function handleWindowBlur() {
    if (testStarted && !testCompleted) {
        console.log('💨 Окно потеряло фокус - срабатывает античит');
        triggerAnticheat();
    }
}

function handleWindowFocus() {
    console.log('🎯 Окно получило фокус');
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function triggerAnticheat() {
    if (!testStarted || testCompleted) {
        console.log('⚠️ Античит не сработал: тест не начат или завершен');
        return;
    }
    
    cheatAttempts++;
    tabSwitchAttempts++;
    antiCheatTriggered = true;
    
    const messageIndex = Math.floor(Math.random() * cheatMessages.length);
    if (cheatMessageElement) cheatMessageElement.textContent = cheatMessages[messageIndex];
    
    remainingTime = 3 * 60;
    if (countdownTimer) countdownTimer.textContent = formatTime(remainingTime);
    
    if (passwordInput) passwordInput.value = '';
    if (continueBtn) continueBtn.disabled = true;
    
    if (blockerOverlay) blockerOverlay.style.display = 'block';
    if (anticheatModal) anticheatModal.style.display = 'block';
    
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    }
    
    startBlockTimer();
    
    console.log(`🚨 Античит сработал! Попыток переключения вкладок: ${tabSwitchAttempts}`);
}

function startBlockTimer() {
    clearInterval(blockTimer);
    
    blockTimer = setInterval(() => {
        remainingTime--;
        if (countdownTimer) countdownTimer.textContent = formatTime(remainingTime);
        
        if (remainingTime <= 10 && countdownTimer) {
            countdownTimer.style.animation = remainingTime % 2 === 0 ? 'none' : 'pulse 0.5s';
        }
        
        if (remainingTime <= 0) {
            clearInterval(blockTimer);
            if (continueBtn) continueBtn.disabled = false;
            cheatBlockTimeouts++;
            console.log(`⏱️ Таймер античит системы истек (${cheatBlockTimeouts} раз)`);
        }
    }, 1000);
}

function closeAntiCheat() {
    clearInterval(blockTimer);
    
    if (blockerOverlay) blockerOverlay.style.display = 'none';
    if (anticheatModal) anticheatModal.style.display = 'none';
    if (passwordInput) passwordInput.value = '';
    
    if (testStarted && !testCompleted && !isTestRestored) {
        startAnticheatMonitoring();
    }
    
    console.log('✅ Античит система отключена');
}

// ==================== TELEGRAM ИНТЕГРАЦИЯ ====================

async function sendResultsToTelegram(grade, correctQuestions, correctProblems, questionScore, problemScore) {
    if (isSubmitted) {
        console.log('📤 Результаты уже отправлены');
        return;
    }
    
    const config = window.TEST_CONFIG.telegram;
    
    if (!config || !config.botToken || !config.chatId) {
        console.warn('Telegram не настроен');
        return;
    }
    
    if (config.botToken === "ВАШ_BOT_TOKEN" || config.botToken === "DEMO_TOKEN") {
        console.warn('⚠️ Используется тестовый токен Telegram');
        return;
    }
    
    const student = window.STUDENT_INFO;
    const testName = window.TEST_CONFIG.title;
    const maxScore = window.TEST_CONFIG.maxScore;
    
    const easterEggsStats = [];
    
    if (clipboardBlocked) {
        easterEggsStats.push(`📋 Антикопирование: ${clipboardAttempts} раз(а)`);
    } else {
        easterEggsStats.push(`📋 Антикопирование: Не использовалось ✅`);
    }
    
    if (antiCheatTriggered) {
        easterEggsStats.push(`🚨 Античит система: ${tabSwitchAttempts} раз(а)`);
        if (cheatBlockTimeouts > 0) {
            easterEggsStats.push(`⏱️ Блокировки по таймеру: ${cheatBlockTimeouts} раз(а)`);
        }
    } else {
        easterEggsStats.push(`🚨 Античит система: Не срабатывала ✅`);
    }
    
    if (skipQuestions.length > 0) {
        easterEggsStats.push(`⏭️ Пропущенных вопросов: ${skipQuestions.length}`);
    }
    
    let msg = `⚡ Результаты контрольной работы "${testName}":

👤 Студент: ${student.firstName} ${student.lastName}
🏫 Класс: ${student.class}
🎯 Баллы: ${totalScore}/${maxScore} (${Math.round(totalScore/maxScore*100)}%)
📝 Оценка: ${grade}

Детализация:
📖 Правильных вопросов: ${correctQuestions}/${window.TEST_CONFIG.totalQuestions} (${questionScore} баллов)
📐 Правильных задач: ${correctProblems}/${window.TEST_CONFIG.totalProblems} (${problemScore} баллов)

`;

    if (skipQuestions.length > 0) {
        msg += `⏭️ Пропущенных вопросов: ${skipQuestions.length}\n\n`;
    }

    if (clipboardBlocked || antiCheatTriggered || skipQuestions.length > 0) {
        msg += `
🚨 **Статистика:**
`;
        easterEggsStats.forEach(stat => {
            msg += `• ${stat}\n`;
        });
    } else {
        msg += `✅ **Честность:** Все системы защиты не срабатывали (чистая работа)\n`;
    }
    
    msg += `
📅 Дата: ${new Date().toLocaleString('ru-RU')}`;
    
    try {
        console.log('📨 Отправка сообщения в Telegram...');
        const response = await fetch(
            `https://api.telegram.org/bot${config.botToken}/sendMessage`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: config.chatId,
                    text: msg,
                    parse_mode: 'Markdown'
                })
            }
        );
        
        const data = await response.json();
        
        if (data.ok) {
            console.log('✅ Результаты отправлены в Telegram');
        } else {
            throw new Error(data.description || 'Неизвестная ошибка Telegram');
        }
    } catch (error) {
        console.error('❌ Ошибка отправки в Telegram:', error);
    }
    
    isSubmitted = true;
}

window.testTelegram = async function() {
    const config = window.TEST_CONFIG.telegram;
    
    if (!config || !config.botToken || !config.chatId) {
        alert('❌ Telegram не настроен в конфигурации теста');
        return;
    }
    
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    
    console.log('🔄 Тестируем отправку в Telegram...');
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: config.chatId,
                text: '🔧 *Тестовая отправка из системы тестирования*\n\n✅ Система работает корректно!\n📅 Время: ' + new Date().toLocaleString('ru-RU'),
                parse_mode: 'Markdown'
            })
        });
        
        const data = await response.json();
        
        if (data.ok) {
            alert('✅ Тестовая отправка в Telegram прошла успешно!');
        } else {
            alert('❌ Ошибка Telegram: ' + (data.description || 'Неизвестная ошибка'));
        }
    } catch (error) {
        alert('❌ Ошибка сети: ' + error.message);
    }
};

// ==================== ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ ====================

window.initTest = initTest;

console.log('📚 Основной скрипт системы тестирования загружен (версия с исправленной отправкой в Telegram)');
console.log('⏳ Ожидаем загрузку конфигурации теста...');

if (window.TEST_CONFIG) {
    console.log('✅ Конфигурация теста уже загружена, инициализируем...');
    setTimeout(() => initTest(), 100);
}

document.addEventListener('DOMContentLoaded', function() {
    const event = new Event('scriptLoaded');
    document.dispatchEvent(event);
    console.log('📢 Событие scriptLoaded отправлено');
});