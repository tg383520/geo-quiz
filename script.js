document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 요소 캐싱 ---
    const startScreen = document.getElementById('start-screen');
    const quizScreen = document.getElementById('quiz-screen');
    const resultsScreen = document.getElementById('results-screen');

    const startFlagQuizBtn = document.getElementById('start-flag-quiz');
    const startCapitalQuizBtn = document.getElementById('start-capital-quiz');
    const startMapFindQuizBtn = document.getElementById('start-map-find-quiz');
    const startMapGuessQuizBtn = document.getElementById('start-map-guess-quiz');

    const questionCounter = document.getElementById('question-counter');
    const scoreDisplay = document.getElementById('score');
    const progressBarInner = document.getElementById('progress-bar-inner');

    const questionArea = document.getElementById('question-area');
    const optionsArea = document.getElementById('options-area');
    const instructionText = document.getElementById('instruction-text');
    const nextQuestionBtn = document.getElementById('next-question-btn');

    const finalScoreDisplay = document.getElementById('final-score');
    const resultMessageDisplay = document.getElementById('result-message');
    const playAgainSameQuizBtn = document.getElementById('play-again-same-quiz-btn');
    const backToMainBtn = document.getElementById('back-to-main-btn');

    // --- 게임 상태 변수 ---
    let allCountries = [];
    let mapQuizCountries = [];
    let currentQuizData = [];
    let currentQuestionIndex = 0;
    let score = 0;
    let quizType = ''; // 'flag', 'capital', 'map-find', 'map-guess'
    const TOTAL_QUESTIONS = 10;
    let worldMapSVG = null;

    // --- 데이터 및 SVG 로드 ---
    async function initializeGameData() {
        try {
            const [countriesResponse, mapResponse] = await Promise.all([
                fetch('https://restcountries.com/v3.1/all?fields=name,capital,flags,cca2,cca3'),
                fetch('./map.svg')
            ]);

            if (!countriesResponse.ok) throw new Error(`국가 데이터 로드 실패: ${countriesResponse.status}`);
            if (!mapResponse.ok) throw new Error(`지도 데이터 로드 실패: ${mapResponse.status}`);

            allCountries = await countriesResponse.json();
            allCountries = allCountries.filter(country => country.capital && country.capital.length > 0 && country.cca2);

            const mapText = await mapResponse.text();
            const parser = new DOMParser();
            worldMapSVG = parser.parseFromString(mapText, 'image/svg+xml').documentElement;

            // SVG 지도에 있는 국가들만 맵 퀴즈용으로 필터링
            const mapCountryIds = Array.from(worldMapSVG.querySelectorAll('.country')).map(path => path.id);
            mapQuizCountries = allCountries.filter(country => mapCountryIds.includes(country.cca2));

            enableQuizButtons();
        } catch (error) {
            console.error("게임 초기화 실패:", error);
            document.getElementById('main-content').innerHTML = '<p>퀴즈 데이터를 불러오는 데 실패했습니다. 페이지를 새로고침 해주세요.</p>';
        }
    }

    function enableQuizButtons() {
        document.querySelectorAll('.quiz-btn').forEach(btn => btn.disabled = false);
    }

    // --- 퀴즈 로직 ---
    function startQuiz(type) {
        quizType = type;
        currentQuestionIndex = 0;
        score = 0;
        updateScoreDisplay();
        prepareQuizData();

        startScreen.classList.add('hidden');
        resultsScreen.classList.add('hidden');
        quizScreen.classList.remove('hidden');
        nextQuestionBtn.classList.add('hidden');

        displayQuestion();
    }

    function prepareQuizData() {
        const sourceCountries = quizType.startsWith('map') ? mapQuizCountries : allCountries;
        sourceCountries.sort(() => 0.5 - Math.random());
        currentQuizData = sourceCountries.slice(0, TOTAL_QUESTIONS);
    }

    function displayQuestion() {
        resetQuestionState();
        if (currentQuestionIndex >= TOTAL_QUESTIONS) {
            showResults();
            return;
        }

        const question = currentQuizData[currentQuestionIndex];
        updateProgress();

        // 퀴즈 유형에 따라 화면 구성
        switch (quizType) {
            case 'flag':
                displayFlagQuestion(question);
                break;
            case 'capital':
                displayCapitalQuestion(question);
                break;
            case 'map-find':
                displayMapFindQuestion(question);
                break;
            case 'map-guess':
                displayMapGuessQuestion(question);
                break;
        }
    }

    // --- 질문 유형별 표시 함수 ---
    function displayFlagQuestion(question) {
        questionArea.innerHTML = `<img id="flag-image" src="${question.flags.svg}" alt="국기">`;
        generateMultipleChoiceOptions(question, 'name');
    }

    function displayCapitalQuestion(question) {
        questionArea.innerHTML = `<p id="country-name-question">'${question.name.common}'의 수도는?</p>`;
        generateMultipleChoiceOptions(question, 'capital');
    }

    function displayMapFindQuestion(question) {
        questionArea.innerHTML = `<p id="country-name-question">'${question.name.common}'을(를) 지도에서 찾아보세요.</p>`;
        instructionText.textContent = '지도에서 해당하는 국가를 클릭하세요.';
        instructionText.classList.remove('hidden');
        renderMap(handleMapClick, question);
    }

    function displayMapGuessQuestion(question) {
        questionArea.innerHTML = '';
        instructionText.textContent = '지도에 표시된 국가는 어디일까요?';
        instructionText.classList.remove('hidden');
        renderMap(() => {}, question, true); // 지도 클릭 비활성화, 국가 하이라이트
        generateMultipleChoiceOptions(question, 'name');
    }

    // --- 선택지 및 지도 처리 ---
    function generateMultipleChoiceOptions(correctAnswer, type) {
        let options = [];
        const correctOption = type === 'name' ? correctAnswer.name.common : correctAnswer.capital[0];
        options.push(correctOption);

        const sourceCountries = quizType.startsWith('map') ? mapQuizCountries : allCountries;

        while (options.length < 4) {
            const randomCountry = sourceCountries[Math.floor(Math.random() * sourceCountries.length)];
            const randomOption = type === 'name' ? randomCountry.name.common : (randomCountry.capital ? randomCountry.capital[0] : null);
            if (randomOption && !options.includes(randomOption)) {
                options.push(randomOption);
            }
        }

        options.sort(() => 0.5 - Math.random());
        options.forEach(optionText => {
            const button = document.createElement('button');
            button.textContent = optionText;
            button.classList.add('option-btn');
            button.addEventListener('click', () => handleOptionClick(button, optionText, correctAnswer));
            optionsArea.appendChild(button);
        });
    }

    function renderMap(clickCallback, question, highlight = false) {
        const mapContainer = document.createElement('div');
        mapContainer.id = 'map-container';
        const clonedMap = worldMapSVG.cloneNode(true);
        mapContainer.appendChild(clonedMap);
        questionArea.appendChild(mapContainer);

        clonedMap.querySelectorAll('.country').forEach(path => {
            path.addEventListener('click', (e) => clickCallback(e, question));
            if (highlight && path.id === question.cca2) {
                path.classList.add('highlight');
            }
        });
    }

    // --- 정답 처리 ---
    function handleOptionClick(button, selectedOption, question) {
        const correctOption = (quizType === 'flag' || quizType === 'map-guess') ? question.name.common : question.capital[0];
        const isCorrect = selectedOption === correctOption;
        showFeedback(isCorrect, button, correctOption);
    }

    function handleMapClick(event, question) {
        const clickedCountryId = event.target.id;
        const isCorrect = clickedCountryId === question.cca2;
        showFeedback(isCorrect, event.target, question.cca2);
    }

    function showFeedback(isCorrect, clickedElement, correctId) {
        // 모든 상호작용 비활성화
        optionsArea.querySelectorAll('.option-btn').forEach(btn => btn.classList.add('disabled'));
        questionArea.querySelectorAll('.country').forEach(path => path.style.pointerEvents = 'none');

        if (isCorrect) {
            score++;
            if (clickedElement.tagName === 'path') {
                clickedElement.classList.add('highlight');
            } else {
                clickedElement.classList.add('correct');
            }
        } else {
            if (clickedElement.tagName === 'path') {
                clickedElement.style.fill = 'var(--incorrect-color)';
                questionArea.querySelector(`#${correctId}`).classList.add('highlight');
            } else {
                clickedElement.classList.add('incorrect');
                optionsArea.querySelectorAll('.option-btn').forEach(btn => {
                    if (btn.textContent === correctId) btn.classList.add('correct');
                });
            }
        }

        updateScoreDisplay();
        nextQuestionBtn.classList.remove('hidden');
    }

    // --- UI 업데이트 및 상태 관리 ---
    function nextQuestion() {
        currentQuestionIndex++;
        displayQuestion();
    }

    function showResults() {
        quizScreen.classList.add('hidden');
        resultsScreen.classList.remove('hidden');
        finalScoreDisplay.textContent = `${score} / ${TOTAL_QUESTIONS}`;
        
        const percentage = (score / TOTAL_QUESTIONS) * 100;
        let message = percentage === 100 ? '🎉 완벽해요! 당신은 지리 마스터!' :
                      percentage >= 70 ? '훌륭해요! 정말 잘 아시는군요!' :
                      percentage >= 40 ? '좋아요! 조금 더 배워볼까요?' :
                                       '아쉬워요. 다시 도전해보세요!';
        resultMessageDisplay.textContent = message;
    }

    function updateScoreDisplay() {
        scoreDisplay.textContent = `점수: ${score}`;
    }

    function updateProgress() {
        const progress = ((currentQuestionIndex + 1) / TOTAL_QUESTIONS) * 100;
        progressBarInner.style.width = `${progress}%`;
        questionCounter.textContent = `문제 ${currentQuestionIndex + 1} / ${TOTAL_QUESTIONS}`;
    }

    function resetQuestionState() {
        questionArea.innerHTML = '';
        optionsArea.innerHTML = '';
        instructionText.classList.add('hidden');
        nextQuestionBtn.classList.add('hidden');
    }

    // --- 이벤트 리스너 설정 ---
    startFlagQuizBtn.addEventListener('click', () => startQuiz('flag'));
    startCapitalQuizBtn.addEventListener('click', () => startQuiz('capital'));
    startMapFindQuizBtn.addEventListener('click', () => startQuiz('map-find'));
    startMapGuessQuizBtn.addEventListener('click', () => startQuiz('map-guess'));
    nextQuestionBtn.addEventListener('click', nextQuestion);
    
    playAgainSameQuizBtn.addEventListener('click', () => startQuiz(quizType));
    backToMainBtn.addEventListener('click', () => {
        resultsScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
    });

    // --- 초기화 ---
    document.querySelectorAll('.quiz-btn').forEach(btn => btn.disabled = true);
    initializeGameData();
});
