// ===============================================
// СИСТЕМА ИДЕНТИФИКАЦИИ УЧЕНИКОВ
// ВЕРСИЯ 3.0 - Улучшенный интерфейс с переключением состояний
// ===============================================

window.selectedStudent = null;

class StudentIdentification {
  constructor() {
    this.init();
  }
  
  init() {
    this.createIdentificationInterface();
    this.setupEventListeners();
    this.checkPreviousSession();
  }
  
  createIdentificationInterface() {
    const identificationHTML = `
      <div class="section" id="student-info-section">
        <div class="section-title">
          <i class="fas fa-user-graduate"></i> Идентификация ученика
        </div>
        
        <!-- Блок 1: Приветствие (скрыт по умолчанию) -->
        <div id="welcome-block" class="welcome-block" style="display: none;">
          <div class="welcome-content">
            <div class="welcome-icon">
              <i class="fas fa-check-circle"></i>
            </div>
            <div class="welcome-text">
              <h3>Ученик идентифицирован!</h3>
              <div id="welcome-student-info" class="welcome-student-info">
                <!-- Информация об ученике будет здесь -->
              </div>
              <p class="welcome-message">Тест одобрен комитетом по запугиванию учеников! 👻</p>
            </div>
          </div>
          
          <div class="welcome-actions">
            <button id="start-test-btn" class="start-test-btn test-btn winter-btn">
              <i class="fas fa-play-circle"></i> Выполнить тест
            </button>
            <button id="change-user-btn" class="change-user-btn">
              <i class="fas fa-exchange-alt"></i> Выбрать другого пользователя
            </button>
          </div>
        </div>
        
        <!-- Блок 2: Форма идентификации (видима по умолчанию) -->
        <div id="identification-form" class="identification-form">
          <div class="student-search">
            <div class="input-group">
              <label for="student-last-name"><i class="fas fa-signature"></i> Фамилия:</label>
              <input type="text" id="student-last-name" placeholder="Например: Иванов" autocomplete="off">
            </div>
            
            <div class="input-group">
              <label for="student-first-name"><i class="fas fa-user"></i> Имя:</label>
              <input type="text" id="student-first-name" placeholder="Например: Иван" autocomplete="off">
            </div>
            
            <div class="input-group">
              <label for="student-class"><i class="fas fa-school"></i> Класс:</label>
              <select id="student-class">
                <option value="">Выберите класс</option>
                <option value="7">7 класс</option>
                <option value="8">8 класс</option>
                <option value="9">9 класс</option>
                <option value="10">10 класс</option>
                <option value="11">11 класс</option>
              </select>
            </div>
            
            <div class="search-actions">
              <button id="find-student-btn" class="search-btn">
                <i class="fas fa-search"></i> Найти меня
              </button>
              
              <button id="admin-login-btn" class="admin-btn">
                <i class="fas fa-user-shield"></i> Вход для учителя
              </button>
            </div>
          </div>
          
          <div id="search-results" class="search-results" style="display: none;">
            <h3><i class="fas fa-users"></i> Результаты поиска:</h3>
            <div id="students-list" class="students-list"></div>
          </div>
          
          <div id="admin-login-form" class="admin-login-form" style="display: none;">
            <h3><i class="fas fa-lock"></i> Вход для администратора</h3>
            
            <div class="input-group">
              <label for="admin-class">Класс:</label>
              <select id="admin-class">
                <option value="7">7 класс</option>
                <option value="8">8 класс</option>
                <option value="9">9 класс</option>
                <option value="10">10 класс</option>
                <option value="11">11 класс</option>
              </select>
            </div>
            
            <div class="input-group">
              <label for="admin-password">Пароль:</label>
              <input type="password" id="admin-password" placeholder="Введите пароль">
            </div>
            
            <div class="admin-actions">
              <button id="admin-login-confirm" class="admin-confirm-btn">
                <i class="fas fa-sign-in-alt"></i> Войти
              </button>
              <button id="admin-login-cancel" class="admin-cancel-btn">
                <i class="fas fa-times"></i> Отмена
              </button>
            </div>
            
            <div class="admin-hint">
              <p><i class="fas fa-info-circle"></i> Для входа используйте пароль, полученный от администратора школы.</p>
            </div>
          </div>
        </div>
      </div>
    `;
    
    const testContent = document.getElementById('test-content');
    if (testContent) {
      testContent.insertAdjacentHTML('beforebegin', identificationHTML);
    }
  }
  
  setupEventListeners() {
    document.getElementById('find-student-btn').addEventListener('click', () => this.findStudent());
    document.getElementById('admin-login-btn').addEventListener('click', () => this.showAdminLogin());
    document.getElementById('admin-login-confirm').addEventListener('click', () => this.adminLogin());
    document.getElementById('admin-login-cancel').addEventListener('click', () => this.hideAdminLogin());
    
    document.getElementById('start-test-btn').addEventListener('click', () => {
      if (window.selectedStudent) {
        this.startTestWithSelectedStudent();
      }
    });
    
    document.getElementById('change-user-btn').addEventListener('click', () => {
      this.showIdentificationForm();
    });
    
    ['student-last-name', 'student-first-name'].forEach(id => {
      document.getElementById(id).addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.findStudent();
      });
    });
  }
  
  findStudent() {
    const lastName = document.getElementById('student-last-name').value.trim();
    const firstName = document.getElementById('student-first-name').value.trim();
    const className = document.getElementById('student-class').value;
    
    if (!lastName || !firstName) {
      alert('⚠️ Пожалуйста, введите фамилию и имя');
      return;
    }
    
    if (!className) {
      alert('⚠️ Пожалуйста, выберите класс');
      return;
    }
    
    const results = window.SCHOOL_DATABASE.searchStudents(lastName, firstName, className);
    
    if (results.length > 0) {
      this.showSearchResults(results, { lastName, firstName, className });
    } else {
      this.showNoResults({ lastName, firstName, className });
    }
  }
  
  showSearchResults(results, userInput) {
    const resultsDiv = document.getElementById('search-results');
    const studentsList = document.getElementById('students-list');
    
    studentsList.innerHTML = '';
    
    const topResults = results.slice(0, 3);
    
    topResults.forEach((result) => {
      const student = result.student;
      const matchPercent = Math.round(result.scores.total * 100);
      
      const studentItem = document.createElement('div');
      studentItem.className = 'student-item';
      studentItem.innerHTML = `
        <div class="student-info">
          <div class="student-name">
            <strong>${student.lastName} ${student.firstName}</strong>
          </div>
          <div class="student-class">
            Класс: ${student.class}
            ${student.isAdmin ? '<span class="admin-badge">👑 Админ</span>' : ''}
          </div>
        </div>
        <div class="student-match">
          <div class="match-percent">${matchPercent}% совпадение</div>
          <button class="select-student-btn" data-id="${student.id}">
            <i class="fas fa-check"></i> Это я
          </button>
        </div>
      `;
      
      studentsList.appendChild(studentItem);
      
      studentItem.querySelector('.select-student-btn').addEventListener('click', () => {
        this.selectStudent(student.id, userInput);
      });
    });
    
    if (results.length > 3) {
      const showMore = document.createElement('div');
      showMore.className = 'show-more';
      showMore.innerHTML = `
        <p>и ещё ${results.length - 3} похожих результатов...</p>
        <button id="show-all-results">Показать все</button>
      `;
      studentsList.appendChild(showMore);
      
      document.getElementById('show-all-results').addEventListener('click', () => {
        this.showAllResults(results, userInput);
      });
    }
    
    resultsDiv.style.display = 'block';
    document.getElementById('admin-login-form').style.display = 'none';
  }
  
  selectStudent(studentId, userInput) {
    const student = window.SCHOOL_DATABASE.getStudentById(studentId);
    
    if (!student) {
      alert('Ошибка: ученик не найден');
      return;
    }
    
    if (student.isAdmin) {
      document.getElementById('admin-class').value = student.class;
      this.showAdminLogin();
      return;
    }
    
    window.selectedStudent = {
      id: student.id,
      lastName: student.lastName,
      firstName: student.firstName,
      class: student.class,
      isAdmin: false
    };
    
    // Сохраняем ученика в localStorage
    this.saveStudentToLocalStorage();
    
    // Показываем блок приветствия и скрываем форму
    this.showWelcomeBlock(student);
    
    console.log('✅ Ученик выбран:', student);
  }
  
  showWelcomeBlock(student) {
    const welcomeBlock = document.getElementById('welcome-block');
    const identificationForm = document.getElementById('identification-form');
    const welcomeStudentInfo = document.getElementById('welcome-student-info');
    
    // Обновляем информацию об ученике
    if (student.isAdmin) {
      welcomeStudentInfo.innerHTML = `
        <div class="student-card-welcome">
          <div class="student-avatar-welcome admin-avatar">
            <i class="fas fa-user-shield"></i>
          </div>
          <div class="student-details-welcome">
            <h4>${student.lastName} ${student.firstName}</h4>
            <p>Класс: ${student.class}</p>
            <p class="student-type"><i class="fas fa-user-shield"></i> Администратор</p>
          </div>
        </div>
      `;
    } else {
      welcomeStudentInfo.innerHTML = `
        <div class="student-card-welcome">
          <div class="student-avatar-welcome">
            ${student.firstName.charAt(0)}${student.lastName.charAt(0)}
          </div>
          <div class="student-details-welcome">
            <h4>${student.lastName} ${student.firstName}</h4>
            <p>Класс: ${student.class}</p>
            <p class="student-type"><i class="fas fa-user-graduate"></i> Ученик</p>
          </div>
        </div>
      `;
    }
    
    // Обновляем текст кнопки
    const startTestBtn = document.getElementById('start-test-btn');
    if (student.isAdmin) {
      startTestBtn.innerHTML = `<i class="fas fa-play-circle"></i> Выполнить тест (Админ)`;
    } else {
      startTestBtn.innerHTML = `<i class="fas fa-play-circle"></i> Выполнить тест (${student.firstName})`;
    }
    
    // Показываем блок приветствия, скрываем форму
    welcomeBlock.style.display = 'block';
    identificationForm.style.display = 'none';
    
    // Скрываем результаты поиска
    document.getElementById('search-results').style.display = 'none';
    
    // Очищаем поля формы
    this.clearIdentificationForm();
  }
  
  showIdentificationForm() {
    const welcomeBlock = document.getElementById('welcome-block');
    const identificationForm = document.getElementById('identification-form');
    
    // Скрываем блок приветствия, показываем форму
    welcomeBlock.style.display = 'none';
    identificationForm.style.display = 'block';
    
    // Сбрасываем выбранного ученика
    window.selectedStudent = null;
    
    // Удаляем сохраненного ученика из localStorage
    localStorage.removeItem('lastStudent');
    
    // Фокус на поле фамилии
    document.getElementById('student-last-name').focus();
    
    console.log('🔄 Показываем форму идентификации');
  }
  
  clearIdentificationForm() {
    document.getElementById('student-last-name').value = '';
    document.getElementById('student-first-name').value = '';
    document.getElementById('student-class').value = '';
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('admin-login-form').style.display = 'none';
  }
  
  showNoResults(userInput) {
    const resultsDiv = document.getElementById('search-results');
    const studentsList = document.getElementById('students-list');
    
    studentsList.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">
          <i class="fas fa-user-slash"></i>
        </div>
        <h4>Ученик не найден</h4>
        <p>Мы не нашли ученика с такими данными:</p>
        <div class="entered-data">
          <p><strong>Фамилия:</strong> ${userInput.lastName}</p>
          <p><strong>Имя:</strong> ${userInput.firstName}</p>
          <p><strong>Класс:</strong> ${userInput.className}</p>
        </div>
        <div class="no-results-suggestions">
          <p><i class="fas fa-lightbulb"></i> Проверьте:</p>
          <ul>
            <li>Правильность написания фамилии и имени</li>
            <li>Выбранный класс</li>
            <li>Отсутствие лишних пробелов</li>
          </ul>
        </div>
      </div>
    `;
    
    resultsDiv.style.display = 'block';
  }
  
  showAdminLogin() {
    document.getElementById('admin-login-form').style.display = 'block';
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('admin-class').focus();
  }
  
  hideAdminLogin() {
    document.getElementById('admin-login-form').style.display = 'none';
    document.getElementById('admin-password').value = '';
  }
  
  adminLogin() {
    const className = document.getElementById('admin-class').value;
    const password = document.getElementById('admin-password').value;
    
    if (!password) {
      alert('⚠️ Введите пароль');
      return;
    }
    
    if (window.SCHOOL_DATABASE.checkAdminPassword(password)) {
      window.selectedStudent = {
        id: -parseInt(className),
        lastName: "Admin",
        firstName: "Admin",
        class: className,
        isAdmin: true,
        adminClass: className
      };
      
      // Сохраняем админа в localStorage
      this.saveStudentToLocalStorage();
      
      // Создаем объект студента для отображения
      const adminStudent = {
        lastName: "Admin",
        firstName: "Admin",
        class: className,
        isAdmin: true
      };
      
      // Показываем блок приветствия
      this.showWelcomeBlock(adminStudent);
      
      console.log('✅ Администратор вошел:', window.selectedStudent);
    } else {
      alert('❌ Неверный пароль');
      document.getElementById('admin-password').value = '';
      document.getElementById('admin-password').focus();
    }
  }
  
  startTestWithSelectedStudent() {
    if (!window.selectedStudent) {
      alert('Пожалуйста, сначала выберите ученика');
      return;
    }
    
    window.STUDENT_INFO = {
      id: window.selectedStudent.id,
      name: window.selectedStudent.lastName + ' ' + window.selectedStudent.firstName,
      lastName: window.selectedStudent.lastName,
      firstName: window.selectedStudent.firstName,
      class: window.selectedStudent.class,
      isAdmin: window.selectedStudent.isAdmin || false,
      startTime: new Date().toISOString()
    };
    
    // Сохраняем ученика в localStorage
    localStorage.setItem('lastStudent', JSON.stringify(window.STUDENT_INFO));
    console.log('💾 Ученик сохранен в localStorage');
    
    // Скрываем блок идентификации и показываем тест
    document.getElementById('student-info-section').style.display = 'none';
    document.getElementById('test-content').style.display = 'block';
    
    if (window.startTestFromScript) {
      window.startTestFromScript();
    }
  }
  
  /**
   * Сохраняет выбранного ученика в localStorage
   */
  saveStudentToLocalStorage() {
    if (window.selectedStudent) {
      try {
        localStorage.setItem('lastStudent', JSON.stringify({
          id: window.selectedStudent.id,
          lastName: window.selectedStudent.lastName,
          firstName: window.selectedStudent.firstName,
          class: window.selectedStudent.class,
          isAdmin: window.selectedStudent.isAdmin || false
        }));
        console.log('💾 Ученик сохранен в localStorage');
      } catch (e) {
        console.error('Ошибка сохранения ученика:', e);
      }
    }
  }
  
  checkPreviousSession() {
    const lastStudent = localStorage.getItem('lastStudent');
    
    if (lastStudent) {
      try {
        const studentData = JSON.parse(lastStudent);
        console.log('👋 Найден предыдущий сеанс ученика:', studentData);
        
        // Восстанавливаем выбранного ученика
        window.selectedStudent = studentData;
        
        // Создаем объект студента для отображения
        const displayStudent = {
          lastName: studentData.lastName,
          firstName: studentData.firstName,
          class: studentData.class,
          isAdmin: studentData.isAdmin || false
        };
        
        // Показываем блок приветствия
        this.showWelcomeBlock(displayStudent);
        
        console.log('✅ Восстановлен сохраненный ученик');
        
      } catch (e) {
        console.error('Ошибка восстановления ученика:', e);
        localStorage.removeItem('lastStudent');
      }
    } else {
      console.log('📭 Сохраненный ученик не найден, показываем форму идентификации');
      // Форма идентификации уже видна по умолчанию
    }
  }
  
  showAllResults(results, userInput) {
    const resultsDiv = document.getElementById('search-results');
    const studentsList = document.getElementById('students-list');
    
    studentsList.innerHTML = '';
    
    results.forEach((result) => {
      const student = result.student;
      const matchPercent = Math.round(result.scores.total * 100);
      
      const studentItem = document.createElement('div');
      studentItem.className = 'student-item expanded';
      studentItem.innerHTML = `
        <div class="student-info">
          <div class="student-name">
            <strong>${student.lastName} ${student.firstName}</strong>
          </div>
          <div class="student-class">
            Класс: ${student.class}
            ${student.isAdmin ? '<span class="admin-badge">👑 Админ</span>' : ''}
          </div>
          <div class="match-details">
            <span class="match-label">Совпадение по фамилии: ${Math.round(result.scores.lastName * 100)}%</span>
            <span class="match-label">Совпадение по имени: ${Math.round(result.scores.firstName * 100)}%</span>
          </div>
        </div>
        <div class="student-match">
          <div class="match-percent">${matchPercent}%</div>
          <button class="select-student-btn" data-id="${student.id}">
            <i class="fas fa-check"></i> Выбрать
          </button>
        </div>
      `;
      
      studentsList.appendChild(studentItem);
      
      studentItem.querySelector('.select-student-btn').addEventListener('click', () => {
        this.selectStudent(student.id, userInput);
      });
    });
  }
}

// Инициализация системы идентификации при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎓 Инициализация системы идентификации...');
  window.studentIdentification = new StudentIdentification();
});