// Глобальные переменные
const DEFAULT_BOT_TOKEN = "8344281396:AAGZ9-M2XRyPMHiI2akBSSIN7QAtRGDmLOY";
const DEFAULT_CHAT_ID = "1189539923";

let currentQuestionIndex = 0;
let totalScore = 0;
let userAnswers = Array(24).fill(null);
let shuffledQuestionsAndProblems = [];
let isSubmitted = false;
let isShowingAnswer = false;
let currentShuffledOptions = [];

// Переменные для отслеживания использования пасхалок
let clipboardAttempts = 0;      // Количество попыток копирования
let tabSwitchAttempts = 0;      // Количество переключений вкладок
let cheatBlockTimeouts = 0;     // Количество срабатываний античит системы
let clipboardBlocked = false;   // Была ли блокировка копирования
let antiCheatTriggered = false; // Срабатывала ли античит система

// Кэшируем DOM
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const questionText = document.getElementById('question-text');
const questionType = document.getElementById('question-type');
const optionsContainer = document.getElementById('options-container');
const confirmBtn = document.getElementById('confirm-btn');
const resetBtn = document.getElementById('reset-btn');
const resultsDiv = document.getElementById('results');
const scoreValue = document.getElementById('score-value');
const gradeValue = document.getElementById('grade-value');
const pointsBreakdown = document.getElementById('points-breakdown');
const telegramStatus = document.getElementById('telegram-status');
const studentNameInput = document.getElementById('student-name');
const studentClassSelect = document.getElementById('student-class');
const fullscreenResult = document.getElementById('fullscreen-result');
const fullscreenGrade = document.getElementById('fullscreen-grade');
const fullscreenScore = document.getElementById('fullscreen-score');
const fullscreenBreakdown = document.getElementById('fullscreen-breakdown');
const finishBtn = document.getElementById('finish-btn');
const startTestBtn = document.getElementById('start-test-btn');
const studentInfoSection = document.getElementById('student-info-section');
const testContent = document.getElementById('test-content');

// ПАСХАЛКА 1: Антикопирование
const clipboardMessages = [
  "Высоковская школа: честность — наш девиз!",
  "Упс! Копирование учебных материалов запрещено.",
  "Знания ценны, когда добыты честным путём!",
  "Наш антижульничательный детектор сработал!",
  "Вы же не хотите попасть в школьный архив нарушителей?",
  "Учителя видят всё... даже попытки копирования!",
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
    
    // Фиксируем попытку копирования
    clipboardAttempts++;
    clipboardBlocked = true;
    
    console.log(`Попытка копирования заблокирована (${clipboardAttempts} раз)`);
  }
});

// Блокировка Ctrl+A
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    if (!isInsideInput(document.activeElement)) {
      e.preventDefault();
      
      // Фиксируем попытку выделения всего текста
      clipboardAttempts++;
      clipboardBlocked = true;
      
      console.log(`Попытка выделения всего текста заблокирована (${clipboardAttempts} раз)`);
    }
  }
});

// Блокировка перетаскивания текста
document.addEventListener('dragstart', function(e) {
  if (!isInsideInput(e.target)) {
    e.preventDefault();
    
    // Фиксируем попытку перетаскивания
    clipboardAttempts++;
    clipboardBlocked = true;
    
    console.log(`Попытка перетаскивания текста заблокирована (${clipboardAttempts} раз)`);
  }
});

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

let cheatAttempts = 0;
let blockTimer = null;
let remainingTime = 0;
const PASSWORD = "3265";

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function showAntiCheat() {
  // Не показываем античит окно, если тест еще не начат или уже завершен
  if (studentInfoSection.style.display !== 'none' || 
      fullscreenResult.style.display === 'flex' ||
      resultsDiv.style.display === 'block') {
    return;
  }
  
  cheatAttempts++;
  tabSwitchAttempts++;
  antiCheatTriggered = true;
  
  const messageIndex = Math.floor(Math.random() * cheatMessages.length);
  document.getElementById('cheatMessage').textContent = cheatMessages[messageIndex];
  
  remainingTime = 3 * 60;
  document.getElementById('countdownTimer').textContent = formatTime(remainingTime);
  
  document.getElementById('passwordInput').value = '';
  document.getElementById('continueBtn').disabled = true;
  
  document.getElementById('blockerOverlay').style.display = 'block';
  document.getElementById('anticheatModal').style.display = 'block';
  
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }
  
  startBlockTimer();
  
  console.log(`Античит сработал! Попыток переключения вкладок: ${tabSwitchAttempts}`);
}

function startBlockTimer() {
  clearInterval(blockTimer);
  
  blockTimer = setInterval(() => {
    remainingTime--;
    document.getElementById('countdownTimer').textContent = formatTime(remainingTime);
    
    if (remainingTime <= 10) {
      const timer = document.getElementById('countdownTimer');
      timer.style.animation = remainingTime % 2 === 0 ? 'none' : 'pulse 0.5s';
    }
    
    if (remainingTime <= 0) {
      clearInterval(blockTimer);
      document.getElementById('continueBtn').disabled = false;
      cheatBlockTimeouts++;
      console.log(`Таймер античит системы истек (${cheatBlockTimeouts} раз)`);
    }
  }, 1000);
}

function closeAntiCheat() {
  clearInterval(blockTimer);
  document.getElementById('blockerOverlay').style.display = 'none';
  document.getElementById('anticheatModal').style.display = 'none';
  console.log('Античит система отключена');
}

// Обработка ввода пароля
document.getElementById('passwordInput').addEventListener('input', function(e) {
  this.value = this.value.replace(/\D/g, '');
  
  if (this.value.length === 4) {
    if (this.value === PASSWORD) {
      document.getElementById('continueBtn').disabled = false;
      setTimeout(() => {
        document.getElementById('continueBtn').click();
      }, 500);
    }
  }
});

// Обработка кнопки "Продолжить"
document.getElementById('continueBtn').addEventListener('click', function() {
  if (!this.disabled) {
    closeAntiCheat();
  }
});

// Отслеживание ухода/возврата на вкладку
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Пользователь ушел с вкладки
    showAntiCheat();
  }
});

// Функция для перемешивания массива (алгоритм Фишера-Йейтса)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Инициализация контрольной работы
function initTest() {
  // Выбираем 21 случайный вопрос из банка (из 50)
  const selectedQuestions = shuffleArray([...questionsBank]).slice(0, 21);
  
  // Выбираем 3 случайные задачи из банка (из 30)
  const selectedProblems = shuffleArray([...problemsBank]).slice(0, 3);
  
  // Объединяем вопросы и задачи
  shuffledQuestionsAndProblems = [...selectedQuestions, ...selectedProblems];
  
  // Перемешиваем порядок
  shuffledQuestionsAndProblems = shuffleArray(shuffledQuestionsAndProblems);
  
  currentQuestionIndex = 0;
  totalScore = 0;
  userAnswers = Array(24).fill(null);
  isSubmitted = false;
  isShowingAnswer = false;
  currentShuffledOptions = [];
  
  // Сбрасываем статистику пасхалок
  clipboardAttempts = 0;
  tabSwitchAttempts = 0;
  cheatBlockTimeouts = 0;
  clipboardBlocked = false;
  antiCheatTriggered = false;
  
  confirmBtn.disabled = false;
  resultsDiv.style.display = 'none';
  fullscreenResult.style.display = 'none';
  
  showQuestion(0);
}

// Показать вопрос/задачу
function showQuestion(index) {
  const item = shuffledQuestionsAndProblems[index];
  questionText.textContent = item.text;
  
  // Устанавливаем тип задания
  if (item.points === 3) {
    questionType.textContent = "Задача (3 балла)";
    questionType.className = "question-type problem-type";
  } else {
    questionType.textContent = "Теоретический вопрос (1 балл)";
    questionType.className = "question-type";
  }
  
  // Перемешиваем варианты ответов для текущего вопроса
  currentShuffledOptions = shuffleArray([...item.options]);
  
  optionsContainer.innerHTML = '';
  currentShuffledOptions.forEach((option, i) => {
    const label = document.createElement('label');
    label.className = 'option-label';
    if (userAnswers[index] === option.v) {
      label.classList.add('selected');
    }
    
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
        confirmBtn.disabled = false;
      });
    }
    
    optionsContainer.appendChild(label);
  });
  
  updateProgress();
}

// Подсветка правильного ответа
function highlightCorrectAnswer() {
  const options = optionsContainer.querySelectorAll('.option-label');
  
  options.forEach((option, index) => {
    const radio = option.querySelector('input');
    if (currentShuffledOptions[index].v === 'correct') {
      option.classList.add('correct');
    } else if (radio.checked && currentShuffledOptions[index].v === 'wrong') {
      option.classList.add('incorrect');
    }
    
    radio.disabled = true;
  });
}

// Обновление прогресса
function updateProgress() {
  const percent = (currentQuestionIndex / 24) * 100;
  progressBar.style.width = `${percent}%`;
  progressText.textContent = `Задание ${currentQuestionIndex + 1} из 24`;
}

// Подтверждение ответа
function confirmAnswer() {
  const selectedOption = document.querySelector('input[name="option"]:checked');
  if (!selectedOption) {
    alert('Выберите вариант ответа');
    return;
  }
  
  userAnswers[currentQuestionIndex] = selectedOption.value;
  
  confirmBtn.disabled = true;
  isShowingAnswer = true;
  
  highlightCorrectAnswer();
  
  setTimeout(() => {
    isShowingAnswer = false;
    
    if (currentQuestionIndex < 23) {
      currentQuestionIndex++;
      showQuestion(currentQuestionIndex);
      confirmBtn.disabled = true;
    } else {
      finishTest();
    }
  }, 2000);
}

// Завершение контрольной работы
function finishTest() {
  // Подсчет результатов
  totalScore = 0;
  let questionScore = 0;
  let problemScore = 0;
  let correctQuestions = 0;
  let correctProblems = 0;
  
  for (let i = 0; i < 24; i++) {
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
  
  const grade = getGrade(totalScore);
  
  // Показ полноэкранного результата
  fullscreenGrade.textContent = grade;
  fullscreenScore.textContent = totalScore;
  fullscreenBreakdown.innerHTML = `
    <div>Правильных вопросов: ${correctQuestions}/21 (${questionScore} баллов)</div>
    <div>Правильных задач: ${correctProblems}/3 (${problemScore} баллов)</div>
  `;
  fullscreenResult.style.display = 'flex';
  
  // Обновление обычного блока результатов
  scoreValue.textContent = totalScore;
  gradeValue.textContent = grade;
  pointsBreakdown.innerHTML = `
    <div>Правильных вопросов: ${correctQuestions} из 21 (${questionScore} баллов)</div>
    <div>Правильных задач: ${correctProblems} из 3 (${problemScore} баллов)</div>
    <div>Всего баллов: ${totalScore} из 30</div>
  `;
  
  // Отправка в Telegram
  sendResultsToTelegram(totalScore, grade, correctQuestions, correctProblems, questionScore, problemScore);
}

// Получение оценки по баллам (максимум 30 баллов)
function getGrade(score) {
  if (score >= 27) return 5;    // 90-100%
  if (score >= 22) return 4;    // 70-89%
  if (score >= 10) return 3;    // 50-69%
  return 2;                     // менее 50%
}

// Отправка в Telegram
async function sendTelegramMessage(botToken, chatId, text) {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data.ok) throw new Error(data.description);
}

// Отправка результатов
async function sendResultsToTelegram(score, grade, correctQuestions, correctProblems, questionScore, problemScore) {
  if (isSubmitted) return;
  
  const name = studentNameInput.value.trim();
  const klass = studentClassSelect.value;
  
  if (!name || !klass) {
    console.log('Имя или класс не заполнены, пропускаем отправку в Telegram');
    return;
  }
  
  try {
    const now = new Date().toLocaleString('ru-RU');
    
    // Подготавливаем статистику пасхалок
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
    
    // Создаем сообщение с учетом пасхалок
    let msg = `⚡ Результаты контрольной работы "Электризация тел. Электрический ток":

👤 Студент: ${name}
🏫 Класс: ${klass}
🎯 Баллы: ${score}/30 (${Math.round(score/30*100)}%)
📝 Оценка: ${grade}

Детализация:
📖 Правильных вопросов: ${correctQuestions}/21 (${questionScore} баллов)
📐 Правильных задач: ${correctProblems}/3 (${problemScore} баллов)

`;

    // Добавляем статистику пасхалок только если они срабатывали
    if (clipboardBlocked || antiCheatTriggered) {
      msg += `
🚨 **Статистика антижульничания:**
`;
      easterEggsStats.forEach(stat => {
        msg += `• ${stat}\n`;
      });
    } else {
      msg += `✅ **Честность:** Все системы защиты не срабатывали (чистая работа)\n`;
    }
    
    msg += `
📅 Дата: ${now}`;
    
    await sendTelegramMessage(DEFAULT_BOT_TOKEN, DEFAULT_CHAT_ID, msg);
    console.log('Результаты отправлены в Telegram');
  } catch (err) {
    console.error('Ошибка отправки в Telegram:', err);
  }
  
  isSubmitted = true;
}

// Завершение полноэкранного режима
function finishFullScreen() {
  fullscreenResult.style.display = 'none';
  resultsDiv.style.display = 'block';
  
  telegramStatus.textContent = 'Результаты отправлены учителю!';
  telegramStatus.className = 'success';
  telegramStatus.style.display = 'block';
  
  setTimeout(() => {
    telegramStatus.style.display = 'none';
    window.location.href = "../index.html";
  }, 5000);
}

// Сброс контрольной работы
function resetAll() {
  if (!confirm('Сбросить всю контрольную работу? Весь прогресс будет потерян.')) return;
  
  studentInfoSection.style.display = 'block';
  testContent.style.display = 'none';
  
  studentNameInput.value = '';
  studentClassSelect.value = '';
  
  // Закрыть античит окно, если открыто
  closeAntiCheat();
  
  // Сброс статистики пасхалок
  clipboardAttempts = 0;
  tabSwitchAttempts = 0;
  cheatBlockTimeouts = 0;
  clipboardBlocked = false;
  antiCheatTriggered = false;
}

// Валидация формы
function validateForm() {
  const name = studentNameInput.value.trim();
  const klass = studentClassSelect.value;
  if (!name) { alert('Введите имя'); return false; }
  if (!klass) { alert('Выберите класс'); return false; }
  return true;
}

// Начало контрольной работы
function startTest() {
  if (!validateForm()) return;
  
  studentInfoSection.style.display = 'none';
  testContent.style.display = 'block';
  
  initTest();
}

// Инициализация
window.onload = function () {
  startTestBtn.addEventListener('click', startTest);
  confirmBtn.addEventListener('click', confirmAnswer);
  resetBtn.addEventListener('click', resetAll);
  finishBtn.addEventListener('click', finishFullScreen);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fullscreenResult.style.display === 'flex') {
      finishFullScreen();
    }
  });
};