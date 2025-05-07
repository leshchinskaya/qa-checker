// Global store for questions
window.allQuestionsData = {
  primaryDisplay: [], 
  secondaryDisplay: [], 
  all: [] 
};
let answeredQuestionIds = new Set();
let totalQuestionsCount = 0; // Will be updated dynamically
window.recommendationTemplates = {};
window.currentResultData = null; // To store the latest result for email

// Function to update progress bar and handle selected answer styling
function updateProgressAndSelection(selectedRadio) {
  const colorClasses = ['answer-yes', 'answer-ambiguous', 'answer-no', 'selected-answer'];
  if (selectedRadio) {
    const questionName = selectedRadio.name;
    document.getElementsByName(questionName).forEach(radio => {
      if (radio.parentElement && radio.parentElement.tagName === 'LABEL') {
        colorClasses.forEach(cls => radio.parentElement.classList.remove(cls));
      }
    });
    const parentLabel = selectedRadio.parentElement;
    if (parentLabel && parentLabel.tagName === 'LABEL') {
      const answerText = parentLabel.querySelector('span').innerText.toLowerCase();
      if (answerText.startsWith('да')) parentLabel.classList.add('answer-yes');
      else if (answerText.startsWith('неоднозначно')) parentLabel.classList.add('answer-ambiguous');
      else if (answerText.startsWith('нет')) parentLabel.classList.add('answer-no');
    }
    const questionId = questionName.replace('q', '');
    answeredQuestionIds.add(questionId);
  }
  const answeredCount = answeredQuestionIds.size;
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  if (progressBar && progressText) {
    const percentage = totalQuestionsCount > 0 ? (answeredCount / totalQuestionsCount) * 100 : 0;
    progressBar.style.width = percentage + '%';
    progressText.innerText = `${answeredCount}/${totalQuestionsCount} вопросов`;
  }
}

async function loadAndCategorizeQuestions() {
  const primaryDisplayIds = [1, 10, 12, 13, 17];
  try {
    const res = await fetch('questions.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.trim()) throw new Error('Пустой файл JSON');
    const allQs = JSON.parse(text);

    window.allQuestionsData.all = allQs;
    window.allQuestionsData.primaryDisplay = []; 
    window.allQuestionsData.secondaryDisplay = []; 

    allQs.forEach(q => {
      if (primaryDisplayIds.includes(q.id)) {
        window.allQuestionsData.primaryDisplay.push(q);
      } else {
        window.allQuestionsData.secondaryDisplay.push(q);
      }
    });
    // totalQuestionsCount will be set in initializeForm initially, 
    // and updated when secondary questions are shown.

  } catch (e) {
    console.error('Ошибка загрузки/парсинга вопросов:', e);
    document.getElementById('formContainer').innerText =
      'Не удалось загрузить вопросы: ' + e.message;
    window.allQuestionsData = { primaryDisplay: [], secondaryDisplay: [], all: [] };
    totalQuestionsCount = 0;
  }
}

function renderQuestions(questionsToRender, containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('Container not found for rendering questions:', containerId);
    return;
  }
  container.innerHTML = ''; // Clear previous questions if any

  questionsToRender.forEach(q => {
    const card = document.createElement('div');
    card.className = 'question';
    card.innerHTML = `<p>${q.text}</p>`;
    const answersDiv = document.createElement('div');
    answersDiv.className = 'answers';
    q.answers.forEach((ans, idx) => {
      const id = `q${q.id}_ans${idx}`;
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `q${q.id}`;
      radio.id = id;
      radio.value = ans.score;
      radio.addEventListener('change', () => updateProgressAndSelection(radio)); // Attach listener
      
      const span = document.createElement('span');
      span.innerHTML = `${ans.text} (${ans.score} балл${ans.score===1?'':'ов'})`;
      
      label.appendChild(radio);
      label.appendChild(span);
      answersDiv.appendChild(label);
    });
    card.appendChild(answersDiv);
    container.appendChild(card);
  });
}

function calculateResult(questionsToScore) { // Only takes the set of questions to score
  const specificCriticalProblemIds = [1, 10, 12, 13, 17];

  // Check specific critical problem IDs based on current DOM state
  for (const id of specificCriticalProblemIds) {
    const els = document.getElementsByName('q'+id);
    for (let el of els) {
      if (el.checked && Number(el.value) === 0) { // 'Нет' has a score of 0
        return {
          isCriticalProblem: true,
          level: 'Критическая проблема!',
          percent: 0, 
          recommendations: window.recommendationTemplates.criticalProblem || "Критическая проблема! Обратитесь к администратору."
        };
      }
    }
  }

  // If no critical problems by specific ID, proceed with scoring the provided questionsToScore
  if (!questionsToScore || !questionsToScore.length) {
    // This case might occur if called with an empty set before questions are loaded/visible
    return { error: window.recommendationTemplates.noQuestions || 'Нет вопросов для оценки.', recommendations: '' };
  }
  
  let total = 0;
  questionsToScore.forEach(q => {
    const els = document.getElementsByName('q'+q.id);
    let answered = false;
    for (let el of els) {
      if (el.checked) {
        total += Number(el.value);
        answered = true;
        break;
      }
    }
    if (!answered) { /* Default score 0 */ }
  });

  let maxScore = 0;
  questionsToScore.forEach(q => {
    let questionMax = 0;
    q.answers.forEach(ans => { if (ans.score > questionMax) questionMax = ans.score; });
    maxScore += questionMax;
  });

  const percent = maxScore > 0 ? Math.round(total / maxScore * 100) : 0;
  let level = '';
  let recommendationsText = '';

  if (percent >= 90) {
    level = 'Отличный уровень';
    recommendationsText = window.recommendationTemplates.highLevel || "Отличная работа!";
  } else if (percent >= 60) {
    level = 'Средний уровень';
    recommendationsText = window.recommendationTemplates.mediumLevel || "Есть к чему стремиться.";
  } else {
    level = 'Низкий уровень';
    recommendationsText = window.recommendationTemplates.lowLevel || "Требуется улучшение.";
  }
  return { percent, level, recommendations: recommendationsText, isCriticalProblem: false };
}

function displayResults(res, resultTypePrefix = "Результат") {
  const out = document.getElementById('result');
  const recommendationsDiv = document.getElementById('recommendationsArea');
  const sendEmailBtn = document.getElementById('sendEmailBtn');

  window.currentResultData = null; // Clear previous result

  if (res.error) {
    out.innerText = res.error;
    recommendationsDiv.innerHTML = '';
    if (sendEmailBtn) sendEmailBtn.style.display = 'none';
  } else if (res.isCriticalProblem) {
    out.innerHTML = `<span style="color: red; font-weight: bold;">${res.level}</span>`;
    recommendationsDiv.innerHTML = res.recommendations;
    window.currentResultData = { level: res.level, recommendations: res.recommendations, isCriticalProblem: true };
    if (sendEmailBtn) sendEmailBtn.style.display = 'block';
  } else {
    out.innerText = `${resultTypePrefix}: ${res.percent}% — ${res.level}`;
    recommendationsDiv.innerHTML = res.recommendations;
    window.currentResultData = { percent: res.percent, level: res.level, recommendations: res.recommendations, isCriticalProblem: false };
    if (sendEmailBtn) sendEmailBtn.style.display = 'block';
  }
}

function initializeForm() {
  const formContainer = document.getElementById('formContainer');
  const additionalContainer = document.getElementById('additionalFormContainer');
  const showResultAndSecondaryBtn = document.getElementById('showResultAndSecondaryBtn');

  if (window.allQuestionsData.all.length > 0) {
    renderQuestions(window.allQuestionsData.primaryDisplay, 'formContainer');
    totalQuestionsCount = window.allQuestionsData.primaryDisplay.length;
    updateProgressAndSelection(null);

    if (showResultAndSecondaryBtn) {
      showResultAndSecondaryBtn.style.display = 'block';
      showResultAndSecondaryBtn.addEventListener('click', function handleShowResultAndSecondary() {
        const prelimResult = calculateResult(window.allQuestionsData.primaryDisplay);
        displayResults(prelimResult, "Предварительный результат");
        
        if (additionalContainer) {
          renderQuestions(window.allQuestionsData.secondaryDisplay, 'additionalFormContainer');
          additionalContainer.style.display = 'block';
        }
        totalQuestionsCount = window.allQuestionsData.all.length;
        updateProgressAndSelection(null);
        showResultAndSecondaryBtn.style.display = 'none';
      }, { once: true });
    }
    if(additionalContainer) additionalContainer.style.display = 'none';

  } else { 
    if (formContainer && !formContainer.innerText.trim()) { 
      formContainer.innerText = 'Нет вопросов для отображения.';
    }
    if(additionalContainer) additionalContainer.style.display = 'none';
    if(showResultAndSecondaryBtn) showResultAndSecondaryBtn.style.display = 'none';
    totalQuestionsCount = 0;
    updateProgressAndSelection(null);
    const sendEmailBtn = document.getElementById('sendEmailBtn');
    if (sendEmailBtn) sendEmailBtn.style.display = 'none'; // Hide email button if no questions
  }
}

document.getElementById('submitBtn').addEventListener('click', () => {
  const res = calculateResult(window.allQuestionsData.all);
  displayResults(res, "Итоговый результат");
});

document.getElementById('sendEmailBtn').addEventListener('click', () => {
  const projectNameInput = document.getElementById('projectName');
  const projectName = projectNameInput ? projectNameInput.value.trim() : 'N/A';

  if (!window.currentResultData) {
    alert('Сначала получите результат, прежде чем отправлять.');
    return;
  }

  const recipient = 'leshchinskaya@surf.dev';
  let subject = `Результаты QA Опроса: ${projectName}`;
  let body = `Проект: ${projectName}\n\n`;

  if (window.currentResultData.isCriticalProblem) {
    body += `Уровень: ${window.currentResultData.level}\n\n`;
    subject += ` - ${window.currentResultData.level}`;
  } else {
    body += `Результат: ${window.currentResultData.percent}%\n`;
    body += `Уровень: ${window.currentResultData.level}\n\n`;
  }
  
  // Remove HTML tags from recommendations for plain text email body
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = window.currentResultData.recommendations;
  const recommendationsText = tempDiv.textContent || tempDiv.innerText || "";
  
  body += `Рекомендации:\n${recommendationsText.trim()}\n\n`;

  body += "Детальные ответы на вопросы:\n";
  if (window.allQuestionsData && window.allQuestionsData.all) {
    window.allQuestionsData.all.forEach(q => {
      body += `\n- ${q.text}: `;
      const questionRadios = document.getElementsByName(`q${q.id}`);
      let selectedAnswerText = "Нет (не отвечено или выбран 'Нет')"; // Default if not found or 'Нет'
      let foundSelected = false;

      for (let radio of questionRadios) {
        if (radio.checked) {
          const parentLabel = radio.parentElement;
          if (parentLabel && parentLabel.tagName === 'LABEL') {
            const span = parentLabel.querySelector('span');
            if (span) {
              // Extract only the answer text, not the score part
              const fullAnswerText = span.innerText;
              selectedAnswerText = fullAnswerText.substring(0, fullAnswerText.lastIndexOf('(')).trim();
            }
          }
          foundSelected = true;
          break;
        }
      }
      // If no radio was explicitly checked, and if the question implies a default 0 / "Нет"
      // The current selectedAnswerText default handles this scenario well enough for the email.
      body += selectedAnswerText;
    });
  }
  body += "\n"; // Add a final newline

  const mailtoLink = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoLink;
});

// Function to load recommendations from JSON
async function loadRecommendations() {
  try {
    const res = await fetch('recommendations.json');
    if (!res.ok) throw new Error(`HTTP ${res.status} when fetching recommendations`);
    const text = await res.text();
    if (!text.trim()) throw new Error('Пустой файл JSON с рекомендациями');
    window.recommendationTemplates = JSON.parse(text);
  } catch (e) {
    console.error('Ошибка загрузки/парсинга рекомендаций:', e);
    // Fallback recommendations in case JSON fails to load
    window.recommendationTemplates = {
      criticalProblem: "<h3>Error</h3><p>Ошибка загрузки файла рекомендаций. Обнаружен ответ \"Нет\" на критический вопрос.</p>",
      highLevel: "<h3>Error</h3><p>Ошибка загрузки файла рекомендаций.</p>",
      mediumLevel: "<h3>Error</h3><p>Ошибка загрузки файла рекомендаций.</p>",
      lowLevel: "<h3>Error</h3><p>Ошибка загрузки файла рекомендаций.</p>",
      noQuestions: "Нет доступных вопросов.",
      answerAll: "Пожалуйста, ответьте на все вопросы."
    };
    // Optionally, display an error message to the user in the UI
    const recommendationsDiv = document.getElementById('recommendationsArea');
    if(recommendationsDiv) recommendationsDiv.innerHTML = "<p style='color:red;'>Не удалось загрузить тексты рекомендаций. Отображаются стандартные сообщения.</p>"; 
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadRecommendations();
  await loadAndCategorizeQuestions();
  initializeForm();
}); 