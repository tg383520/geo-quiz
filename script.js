document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 요소 캐싱 ---
    const appContainer = document.getElementById('app-container');
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
    const backToMainDuringQuizBtn = document.getElementById('back-to-main-during-quiz-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');

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
    let quizType = '';
    const TOTAL_QUESTIONS = 10;
    let worldMapSVG = null;
    let originalViewBox = null;
    
    let isRightMouseDown = false;
    let isPanning = false;
    let lastMousePos = { x: 0, y: 0 };
    let currentZoomAnimation = null;

    // --- 유틸리티 함수 ---
    const getCountryName = (country) => (country.translations && country.translations.kor ? country.translations.kor.common : country.name.common) || country.name.common;

    // --- 데이터 및 SVG 로드 ---
    async function initializeGameData() {
        try {
            const [countriesResponse, mapResponse] = await Promise.all([
                fetch('https://restcountries.com/v3.1/all?fields=name,capital,flags,cca2,cca3,translations'),
                fetch('./map.svg')
            ]);

            if (!countriesResponse.ok) throw new Error(`국가 데이터 로드 실패: ${countriesResponse.status}`);
            if (!mapResponse.ok) throw new Error(`지도 데이터 로드 실패: ${mapResponse.status}`);

            allCountries = await countriesResponse.json();
            allCountries = allCountries.filter(c => c.capital && c.capital.length > 0 && c.cca2 && c.cca3 && c.translations.kor);

            const mapText = await mapResponse.text();
            const parser = new DOMParser();
            worldMapSVG = parser.parseFromString(mapText, 'image/svg+xml').documentElement;
            originalViewBox = worldMapSVG.getAttribute('viewBox');

            const mapCountryIds = Array.from(worldMapSVG.querySelectorAll('path[id]')).map(path => path.id.toLowerCase());
            // [수정] 2글자(cca2) 코드로 다시 매칭합니다.
            mapQuizCountries = allCountries.filter(country => mapCountryIds.includes(country.cca2.toLowerCase()));

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
        
        appContainer.classList.remove('map-quiz-mode');

        prepareQuizData();
        if (!currentQuizData) return;

        startScreen.classList.add('hidden');
        resultsScreen.classList.add('hidden');
        quizScreen.classList.remove('hidden');
        nextQuestionBtn.classList.add('hidden');

        displayQuestion();
    }

    function prepareQuizData() {
        const sourceCountries = quizType.startsWith('map') ? mapQuizCountries : allCountries;
        if (sourceCountries.length < TOTAL_QUESTIONS) {
            alert(`지도 퀴즈를 위한 국가 데이터가 부족합니다. (지도에 포함된 국가 ${TOTAL_QUESTIONS}개 이상 필요)`);
            currentQuizData = null;
            goBackToMainMenu();
            return;
        }
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

        switch (quizType) {
            case 'flag': displayFlagQuestion(question); break;
            case 'capital': displayCapitalQuestion(question); break;
            case 'map-find': displayMapFindQuestion(question); break;
            case 'map-guess': displayMapGuessQuestion(question); break;
        }
    }

    // --- 질문 유형별 표시 함수 ---
    function displayFlagQuestion(question) {
        questionArea.innerHTML = `<img id="flag-image" src="${question.flags.svg}" alt="국기">`;
        generateMultipleChoiceOptions(question, 'name');
    }

    function displayCapitalQuestion(question) {
        questionArea.innerHTML = `<p id="country-name-question">'${getCountryName(question)}'의 수도는?</p>`;
        generateMultipleChoiceOptions(question, 'capital');
    }

    function displayMapFindQuestion(question) {
        appContainer.classList.add('map-quiz-mode');
        questionArea.innerHTML = `<p id="country-name-question">'${getCountryName(question)}'을(를) 지도에서 찾아보세요.</p>`;
        instructionText.textContent = '우클릭 + 휠로 확대/축소, 우클릭 + 드래그로 이동하세요.';
        instructionText.classList.remove('hidden');
        renderMap(handleMapClick, question);
    }

    function displayMapGuessQuestion(question) {
        appContainer.classList.add('map-quiz-mode');
        questionArea.innerHTML = '';
        instructionText.textContent = '지도에 표시된 국가는 어디일까요?';
        instructionText.classList.remove('hidden');
        renderMap(() => {}, question, { highlight: true, arrow: true });
        generateMultipleChoiceOptions(question, 'name');
    }

    // --- 선택지 및 지도 처리 ---
    function generateMultipleChoiceOptions(correctAnswer, type) {
        let options = [];
        const correctOption = type === 'name' ? getCountryName(correctAnswer) : correctAnswer.capital[0];
        options.push(correctOption);

        const sourceCountries = quizType.startsWith('map') ? mapQuizCountries : allCountries;

        while (options.length < 4) {
            const randomCountry = sourceCountries[Math.floor(Math.random() * sourceCountries.length)];
            const randomOption = type === 'name' ? getCountryName(randomCountry) : (randomCountry.capital ? randomCountry.capital[0] : null);
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

    function renderMap(clickCallback, question, effects = {}) {
        const mapContainer = document.createElement('div');
        mapContainer.id = 'map-container';
        const clonedMap = worldMapSVG.cloneNode(true);
        
        clonedMap.removeAttribute('width');
        clonedMap.removeAttribute('height');
        clonedMap.id = 'world-map-svg';
        clonedMap.setAttribute('viewBox', originalViewBox);

        mapContainer.appendChild(clonedMap);
        questionArea.appendChild(mapContainer);

        mapContainer.addEventListener('contextmenu', e => e.preventDefault());
        mapContainer.addEventListener('mousedown', handleMouseDown);
        mapContainer.addEventListener('wheel', handleWheelZoom, { passive: false });

        // [수정] 2글자 코드로 경로 검색
        const countryPath = clonedMap.querySelector(`path[id='${question.cca2.toLowerCase()}']`);

        clonedMap.querySelectorAll('path[id]').forEach(path => {
            path.classList.add('country');
            path.addEventListener('click', (e) => {
                if (!isPanning) { 
                    clickCallback(e, question);
                }
            });
        });

        if (effects.highlight && countryPath) {
            countryPath.classList.add('highlight');
        }
        if (effects.arrow && countryPath) {
            addPointerArrow(clonedMap, countryPath.getBBox());
        }
    }

    function addPointerArrow(svg, bbox) {
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const arrowSize = Math.min(bbox.width, bbox.height, 20) + 15;
        const targetX = bbox.x + bbox.width / 2;
        const targetY = bbox.y - arrowSize / 2;
        const pathData = `M ${targetX} ${targetY} l -${arrowSize/2} -${arrowSize} h ${arrowSize} z`;
        arrow.setAttribute('d', pathData);
        arrow.classList.add('pointer-arrow');
        svg.appendChild(arrow);
    }

    // --- 지도 상호작용 핸들러 (줌, 패닝) ---
    function handleMouseDown(event) {
        if (event.button !== 2) return;
        isRightMouseDown = true;
        isPanning = false;
        lastMousePos = { x: event.clientX, y: event.clientY };

        const onMouseMove = (e) => {
            if (!isPanning && (Math.abs(e.clientX - lastMousePos.x) > 2 || Math.abs(e.clientY - lastMousePos.y) > 2)) {
                isPanning = true;
            }
            if (isPanning) {
                handlePan(e);
            }
        };

        const onMouseUp = () => {
            setTimeout(() => { isPanning = false; }, 0);
            isRightMouseDown = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    function handlePan(event) {
        if (!isRightMouseDown) return;
        const svg = questionArea.querySelector('#world-map-svg');
        if (!svg) return;

        const dx = event.clientX - lastMousePos.x;
        const dy = event.clientY - lastMousePos.y;

        const svgRect = svg.getBoundingClientRect();
        const viewBox = svg.getAttribute('viewBox').split(' ').map(Number);
        
        const scaleX = viewBox[2] / svgRect.width;
        const scaleY = viewBox[3] / svgRect.height;

        viewBox[0] -= dx * scaleX;
        viewBox[1] -= dy * scaleY;

        svg.setAttribute('viewBox', viewBox.join(' '));
        lastMousePos = { x: event.clientX, y: event.clientY };
    }

    function handleWheelZoom(event) {
        if (!isRightMouseDown) return;
        event.preventDefault();

        const svg = event.currentTarget.querySelector('#world-map-svg');
        if (!svg) return;

        const viewBox = svg.getAttribute('viewBox').split(' ').map(Number);
        const [x, y, width, height] = viewBox;
        const zoomFactor = 1.2;

        let newWidth, newHeight;
        if (event.deltaY < 0) {
            newWidth = width / zoomFactor;
            newHeight = height / zoomFactor;
            zoomOutBtn.classList.remove('hidden');
        } else {
            newWidth = width * zoomFactor;
            newHeight = height * zoomFactor;
        }
        
        const newX = x + (width - newWidth) / 2;
        const newY = y + (height - newHeight) / 2;

        smoothlySetViewBox(svg, [newX, newY, newWidth, newHeight]);
    }

    function smoothlySetViewBox(svg, targetValues) {
        if (currentZoomAnimation) cancelAnimationFrame(currentZoomAnimation);

        const startValues = svg.getAttribute('viewBox').split(' ').map(Number);
        const duration = 250;
        let startTime = null;

        function animate(currentTime) {
            if (!startTime) startTime = currentTime;
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(elapsedTime / duration, 1);

            const interpolatedValues = startValues.map((start, index) => start + (targetValues[index] - start) * progress);
            svg.setAttribute('viewBox', interpolatedValues.join(' '));

            if (progress < 1) {
                currentZoomAnimation = requestAnimationFrame(animate);
            } else {
                currentZoomAnimation = null;
            }
        }
        currentZoomAnimation = requestAnimationFrame(animate);
    }

    // --- 정답 처리 ---
    function handleOptionClick(button, selectedOption, question) {
        const correctOption = (quizType === 'flag' || quizType === 'map-guess') ? getCountryName(question) : question.capital[0];
        const isCorrect = selectedOption === correctOption;
        showFeedback(isCorrect, button, correctOption);
    }

    function handleMapClick(event, question) {
        const clickedCountryId = event.target.id;
        // [수정] 2글자 코드로 비교
        const isCorrect = clickedCountryId.toLowerCase() === question.cca2.toLowerCase();
        showFeedback(isCorrect, event.target, getCountryName(question));
    }

    function showFeedback(isCorrect, clickedElement, correctId) {
        optionsArea.querySelectorAll('.option-btn').forEach(btn => btn.classList.add('disabled'));
        questionArea.querySelectorAll('path[id]').forEach(path => path.style.pointerEvents = 'none');

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
                // [수정] 2글자 코드로 정답 경로 검색
                const correctCountryCode = currentQuizData[currentQuestionIndex].cca2.toLowerCase();
                const correctPath = questionArea.querySelector(`path[id='${correctCountryCode}']`);
                if(correctPath) correctPath.classList.add('highlight');
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
        appContainer.classList.remove('map-quiz-mode');
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
        zoomOutBtn.classList.add('hidden');
    }

    function goBackToMainMenu() {
        appContainer.classList.remove('map-quiz-mode');
        quizScreen.classList.add('hidden');
        resultsScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
    }

    // --- 이벤트 리스너 설정 ---
    startFlagQuizBtn.addEventListener('click', () => startQuiz('flag'));
    startCapitalQuizBtn.addEventListener('click', () => startQuiz('capital'));
    startMapFindQuizBtn.addEventListener('click', () => startQuiz('map-find'));
    startMapGuessQuizBtn.addEventListener('click', () => startQuiz('map-guess'));
    nextQuestionBtn.addEventListener('click', nextQuestion);
    
    playAgainSameQuizBtn.addEventListener('click', () => startQuiz(quizType));
    backToMainBtn.addEventListener('click', goBackToMainMenu);
    backToMainDuringQuizBtn.addEventListener('click', () => {
        if (confirm('정말로 게임을 중단하고 메인 화면으로 돌아가시겠습니까?')) {
            goBackToMainMenu();
        }
    });
    zoomOutBtn.addEventListener('click', () => {
        const svg = questionArea.querySelector('#world-map-svg');
        if (svg) {
            smoothlySetViewBox(svg, originalViewBox.split(' ').map(Number));
            zoomOutBtn.classList.add('hidden');
        }
    });

    // --- 초기화 ---
    document.querySelectorAll('.quiz-btn').forEach(btn => btn.disabled = true);
    initializeGameData();
});
